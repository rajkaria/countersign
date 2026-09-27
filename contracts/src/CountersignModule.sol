// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReservedProtection} from "./ReservedProtection.sol";
import {RestrictedCctpAdapter} from "./RestrictedCctpAdapter.sol";

interface ISafeModuleExecutor {
    function execTransactionFromModuleReturnData(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success, bytes memory returnData);
}

/// @notice Minimal, non-upgradeable authority boundary for one Safe and one ERC20.
contract CountersignModule is EIP712, ReentrancyGuard {
    struct Policy {
        uint256 perPayment;
        uint256 rolling24h;
        uint256 lifetime;
        uint256 cashFloor;
        uint64 validUntil;
        bool coveredOnly;
    }

    struct Engagement {
        uint64 version;
        address recipient;
        uint256 destinationChainId;
        uint256 perPayment;
        uint256 rolling24h;
        uint256 lifetime;
        bool active;
    }

    struct PaymentPermit {
        uint256 schemaVersion;
        uint256 chainId;
        address safe;
        address module;
        uint256 policyEpoch;
        bytes32 engagementId;
        uint64 engagementVersion;
        bytes32 obligationId;
        bytes32 allocationId;
        bytes32 paymentId;
        uint256 sourceChainId;
        uint256 destinationChainId;
        address recipient;
        address token;
        uint256 amount;
        uint256 maxFee;
        bytes32 route;
        bytes32 evidenceCommitment;
        uint64 expiresAt;
        uint256 nonce;
        bytes32 coverageId;
        uint32 destinationDomain;
        uint32 minFinalityThreshold;
    }

    struct Checkpoint {
        uint64 timestamp;
        uint256 cumulative;
    }

    struct Route {
        address adapter;
        uint32 domain;
        bool enabled;
    }

    struct Pending {
        bytes32 coverageId;
        bytes32 digest;
        bool confirmed;
    }
    bytes32 public constant DIRECT_ROUTE = keccak256("DIRECT_ERC20_V1");
    bytes32 public constant CCTP_ROUTE = keccak256("CCTP_V2_STANDARD_V1");
    bytes32 public constant PERMIT_TYPEHASH = keccak256(
        "PaymentPermit(uint256 schemaVersion,uint256 chainId,address safe,address module,uint256 policyEpoch,bytes32 engagementId,uint64 engagementVersion,bytes32 obligationId,bytes32 allocationId,bytes32 paymentId,uint256 sourceChainId,uint256 destinationChainId,address recipient,address token,uint256 amount,uint256 maxFee,bytes32 route,bytes32 evidenceCommitment,uint64 expiresAt,uint256 nonce,bytes32 coverageId,uint32 destinationDomain,uint32 minFinalityThreshold)"
    );
    address public immutable safe;
    IERC20 public immutable token;
    ReservedProtection public immutable reserve;
    address public executor;
    address public verifier;
    uint256 public policyEpoch;
    bool public paused = true;
    Policy public policy;
    uint256 public totalSpent;
    mapping(bytes32 => Engagement) public engagements;
    mapping(bytes32 => uint256) public engagementSpent;
    mapping(bytes32 => uint256) public obligationLimit;
    mapping(bytes32 => bytes32) public obligationEngagement;
    mapping(bytes32 => uint256) public obligationPaid;
    mapping(bytes32 => bool) public usedPayment;
    mapping(bytes32 => bool) public usedAllocation;
    mapping(uint256 => bool) public usedNonce;
    mapping(uint256 => Route) public routes;
    mapping(bytes32 => Pending) public pending;
    Checkpoint[] private globalHistory;
    mapping(bytes32 => Checkpoint[]) private engagementHistory;
    error OnlySafe();
    error OnlyExecutor();
    error OnlyVerifier();
    error Paused();
    error InvalidPermit();
    error InvalidSignature();
    error Replay();
    error CapExceeded();
    error CashFloor();
    error TransferFailed();
    error InvalidConfiguration();
    error UnsupportedRoute();
    event PolicyChanged(uint256 indexed epoch, address executor, address verifier);
    event PauseChanged(bool paused, uint256 epoch);
    event EngagementChanged(bytes32 indexed id, uint64 version, uint256 epoch);
    event ObligationChanged(bytes32 indexed id, bytes32 indexed engagementId, uint256 cap, uint256 epoch);
    event RouteChanged(uint256 indexed destinationChainId, address adapter, uint32 domain, bool enabled, uint256 epoch);
    event PaymentExecuted(
        bytes32 indexed paymentId,
        bytes32 indexed permitDigest,
        bytes32 indexed obligationId,
        address recipient,
        uint256 amount,
        bytes32 route,
        bool destinationConfirmed
    );
    event DestinationConfirmed(bytes32 indexed paymentId, bytes32 indexed receipt);
    modifier onlySafe() {
        if (msg.sender != safe) revert OnlySafe();
        _;
    }

    constructor(address safe_, address token_, address reserve_) EIP712("Countersign", "1") {
        if (safe_.code.length == 0 || token_.code.length == 0 || (reserve_ != address(0) && reserve_.code.length == 0)) revert InvalidConfiguration();
        safe = safe_;
        token = IERC20(token_);
        reserve = ReservedProtection(reserve_);
        if (reserve_ != address(0) && address(reserve.token()) != token_) revert InvalidConfiguration();
    }

    function configure(address executor_, address verifier_, Policy calldata p) external onlySafe {
        if (
            executor_ == address(0) || verifier_ == address(0) || executor_ == verifier_ || executor_ == safe
                || verifier_ == safe || p.perPayment == 0 || p.rolling24h < p.perPayment || p.lifetime < totalSpent
                || p.validUntil <= block.timestamp || (p.coveredOnly && address(reserve) == address(0))
        ) revert InvalidConfiguration();
        executor = executor_;
        verifier = verifier_;
        policy = p;
        paused = false;
        ++policyEpoch;
        emit PolicyChanged(policyEpoch, executor_, verifier_);
    }

    function pause() external onlySafe {
        paused = true;
        ++policyEpoch;
        emit PauseChanged(true, policyEpoch);
    }

    function unpause() external onlySafe {
        paused = false;
        ++policyEpoch;
        emit PauseChanged(false, policyEpoch);
    }

    function revoke() external onlySafe {
        paused = true;
        executor = address(0);
        verifier = address(0);
        ++policyEpoch;
        emit PolicyChanged(policyEpoch, address(0), address(0));
    }

    function setEngagement(bytes32 id, Engagement calldata e) external onlySafe {
        if (
            id == 0 || e.version <= engagements[id].version || e.recipient == address(0) || e.destinationChainId == 0
                || e.perPayment == 0 || e.rolling24h < e.perPayment || e.lifetime < engagementSpent[id]
        ) revert InvalidConfiguration();
        engagements[id] = e;
        ++policyEpoch;
        emit EngagementChanged(id, e.version, policyEpoch);
    }

    function setObligation(bytes32 id, bytes32 engagementId, uint256 cap) external onlySafe {
        if (
            id == 0 || engagements[engagementId].version == 0 || cap < obligationPaid[id] || cap == 0
                || (obligationEngagement[id] != 0 && obligationEngagement[id] != engagementId)
        ) revert InvalidConfiguration();
        obligationEngagement[id] = engagementId;
        obligationLimit[id] = cap;
        ++policyEpoch;
        emit ObligationChanged(id, engagementId, cap, policyEpoch);
    }

    /// @notice Configure only a purpose-built immutable adapter with this module/token binding.
    function setRoute(uint256 destinationChainId, address adapter, uint32 domain, bool enabled) external onlySafe {
        if (
            destinationChainId == 0 || destinationChainId == block.chainid || adapter.code.length == 0
                || RestrictedCctpAdapter(adapter).module() != address(this)
                || address(RestrictedCctpAdapter(adapter).token()) != address(token)
        ) revert InvalidConfiguration();
        routes[destinationChainId] = Route(adapter, domain, enabled);
        ++policyEpoch;
        emit RouteChanged(destinationChainId, adapter, domain, enabled, policyEpoch);
    }

    function permitDigest(PaymentPermit memory p) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PERMIT_TYPEHASH, p)));
    }

    function rollingSpent() external view returns (uint256) {
        return _rolling(globalHistory);
    }

    function engagementRollingSpent(bytes32 id) external view returns (uint256) {
        return _rolling(engagementHistory[id]);
    }

    function execute(PaymentPermit calldata p, bytes calldata verifierSignature) external nonReentrant {
        if (msg.sender != executor) revert OnlyExecutor();
        if (paused) revert Paused();
        Engagement memory e = engagements[p.engagementId];
        if (
            p.schemaVersion != 1 || p.chainId != block.chainid || p.sourceChainId != block.chainid || p.safe != safe
                || p.module != address(this) || p.token != address(token) || p.policyEpoch != policyEpoch
                || p.expiresAt < block.timestamp || policy.validUntil < block.timestamp || p.amount == 0
                || p.paymentId == 0 || p.allocationId == 0 || p.evidenceCommitment == 0 || !e.active
                || p.engagementVersion != e.version || p.recipient != e.recipient
                || p.destinationChainId != e.destinationChainId
                || obligationEngagement[p.obligationId] != p.engagementId
        ) revert InvalidPermit();
        if (usedPayment[p.paymentId] || usedAllocation[p.allocationId] || usedNonce[p.nonce]) revert Replay();
        bool direct = p.route == DIRECT_ROUTE;
        Route memory route = routes[p.destinationChainId];
        if (direct) {
            if (
                p.destinationChainId != block.chainid || p.maxFee != 0 || p.destinationDomain != 0
                    || p.minFinalityThreshold != 0
            ) revert UnsupportedRoute();
        } else if (
            p.route != CCTP_ROUTE || !route.enabled || route.domain != p.destinationDomain
                || p.minFinalityThreshold != 2000 || p.maxFee >= p.amount
        ) {
            revert UnsupportedRoute();
        }
        if (
            p.amount > policy.perPayment || p.amount > e.perPayment || totalSpent + p.amount > policy.lifetime
                || engagementSpent[p.engagementId] + p.amount > e.lifetime
                || obligationPaid[p.obligationId] + p.amount > obligationLimit[p.obligationId]
                || _rolling(globalHistory) + p.amount > policy.rolling24h
                || _rolling(engagementHistory[p.engagementId]) + p.amount > e.rolling24h
        ) revert CapExceeded();
        uint256 beforeBalance = token.balanceOf(safe);
        if (beforeBalance < p.amount || beforeBalance - p.amount < policy.cashFloor) revert CashFloor();
        bytes32 digest = permitDigest(p);
        if (!SignatureChecker.isValidSignatureNow(verifier, digest, verifierSignature)) revert InvalidSignature();
        if (policy.coveredOnly && p.coverageId == 0) revert InvalidPermit();
        usedPayment[p.paymentId] = true;
        usedAllocation[p.allocationId] = true;
        usedNonce[p.nonce] = true;
        totalSpent += p.amount;
        engagementSpent[p.engagementId] += p.amount;
        obligationPaid[p.obligationId] += p.amount;
        _record(globalHistory, totalSpent);
        _record(engagementHistory[p.engagementId], engagementSpent[p.engagementId]);
        if (p.coverageId != 0) {
            if (address(reserve) == address(0)) revert InvalidPermit();
            reserve.activate(p.coverageId, digest, p.paymentId, safe, direct, policy.coveredOnly ? p.amount : 0);
        }
        address target = direct ? p.recipient : route.adapter;
        uint256 targetBefore = token.balanceOf(target);
        (bool success, bytes memory data) = ISafeModuleExecutor(safe)
            .execTransactionFromModuleReturnData(
                address(token), 0, abi.encodeCall(IERC20.transfer, (target, p.amount)), 0
            );
        if (
            !success || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))
                || token.balanceOf(safe) != beforeBalance - p.amount
                || token.balanceOf(target) != targetBefore + p.amount
        ) revert TransferFailed();
        if (!direct) {
            pending[p.paymentId] = Pending(p.coverageId, digest, false);
            RestrictedCctpAdapter(route.adapter)
                .burn(p.paymentId, p.amount, p.destinationDomain, p.recipient, p.maxFee, p.minFinalityThreshold);
        }
        emit PaymentExecuted(p.paymentId, digest, p.obligationId, p.recipient, p.amount, p.route, direct);
    }

    /// @notice Independent verifier confirms destination evidence, never the executor. Source burn alone is insufficient.
    /// @dev This is a trusted attestation, not an on-chain cross-chain light client.
    function confirmDestination(bytes32 paymentId, bytes32 destinationReceipt) external nonReentrant {
        if (msg.sender != verifier) revert OnlyVerifier();
        Pending storage p = pending[paymentId];
        if (p.digest == 0 || p.confirmed || destinationReceipt == 0) revert InvalidPermit();
        p.confirmed = true;
        if (p.coverageId != 0) reserve.confirmSettlement(p.coverageId, destinationReceipt);
        emit DestinationConfirmed(paymentId, destinationReceipt);
    }

    function _record(Checkpoint[] storage history, uint256 cumulative) private {
        if (history.length != 0 && history[history.length - 1].timestamp == block.timestamp) {
            history[history.length - 1].cumulative = cumulative;
        } else {
            history.push(Checkpoint(uint64(block.timestamp), cumulative));
        }
    }

    /// @dev Exact interval (now - 24 hours, now]; binary search avoids unbounded linear pruning.
    function _rolling(Checkpoint[] storage history) private view returns (uint256) {
        uint256 n = history.length;
        if (n == 0) return 0;
        if (block.timestamp < 1 days) return history[n - 1].cumulative;
        uint256 cutoff = block.timestamp - 1 days;
        uint256 low;
        uint256 high = n;
        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (history[mid].timestamp <= cutoff) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return history[n - 1].cumulative - (low == 0 ? 0 : history[low - 1].cumulative);
    }
}
