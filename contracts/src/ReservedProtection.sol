// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Full collateralization of explicit, immutable per-payment liability.
/// @dev This contract enforces capacity and payout authority, not factual loss adjudication.
contract ReservedProtection is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum State {
        None,
        Reserved,
        Executing,
        Settled,
        Claimed,
        Closed
    }

    struct Allocation {
        address module;
        address beneficiary;
        bytes32 permitDigest;
        bytes32 paymentId;
        uint256 cap;
        uint64 permitExpiry;
        uint64 claimDeadline;
        State state;
        bytes32 termsHash;
    }
    IERC20 public immutable token;
    address public immutable administrator;
    address public immutable allocator;
    address public immutable reviewer;
    uint64 public constant CLAIM_WINDOW = 14 days;
    uint256 public committed;
    uint256 public totalPaid;
    mapping(address => bool) public modules;
    mapping(bytes32 => Allocation) public allocations;
    mapping(bytes32 => bool) public paymentAllocated;
    error Unauthorized();
    error InvalidState();
    error InvalidAllocation();
    error InsufficientCapacity();
    event ModulePermission(address indexed module, bool enabled);
    event Allocated(
        bytes32 indexed id,
        bytes32 indexed permitDigest,
        bytes32 indexed paymentId,
        address beneficiary,
        uint256 cap,
        bytes32 termsHash
    );
    event Activated(bytes32 indexed id, bool settled);
    event SettlementRecorded(bytes32 indexed id, uint64 deadline, bytes32 receipt);
    event ClaimFiled(bytes32 indexed id, bytes32 evidence);
    event ClaimResolved(bytes32 indexed id, uint256 netLoss, uint256 recovery, uint256 payout, bytes32 determination);
    event Released(bytes32 indexed id);
    event Withdrawn(address indexed recipient, uint256 amount);

    constructor(address token_, address administrator_, address allocator_, address reviewer_) {
        if (
            token_.code.length == 0 || administrator_ == address(0) || allocator_ == address(0)
                || reviewer_ == address(0) || reviewer_ == administrator_ || reviewer_ == allocator_
        ) revert InvalidAllocation();
        token = IERC20(token_);
        administrator = administrator_;
        allocator = allocator_;
        reviewer = reviewer_;
    }

    function setModule(address module, bool enabled) external {
        if (msg.sender != administrator) revert Unauthorized();
        if (module.code.length == 0) revert InvalidAllocation();
        modules[module] = enabled;
        emit ModulePermission(module, enabled);
    }

    function freeCapacity() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        return balance > committed ? balance - committed : 0;
    }

    /// @notice A reservation cannot be reduced or rewritten after publication.
    function allocate(
        bytes32 id,
        address module,
        bytes32 digest,
        bytes32 paymentId,
        address beneficiary,
        uint256 cap,
        uint64 permitExpiry,
        bytes32 termsHash
    ) external {
        if (msg.sender != allocator) revert Unauthorized();
        if (
            !modules[module] || id == 0 || digest == 0 || paymentId == 0 || beneficiary == address(0) || cap == 0
                || permitExpiry <= block.timestamp || termsHash == 0 || allocations[id].state != State.None
                || paymentAllocated[paymentId]
        ) revert InvalidAllocation();
        if (cap > freeCapacity()) revert InsufficientCapacity();
        committed += cap;
        paymentAllocated[paymentId] = true;
        allocations[id] =
            Allocation(module, beneficiary, digest, paymentId, cap, permitExpiry, 0, State.Reserved, termsHash);
        emit Allocated(id, digest, paymentId, beneficiary, cap, termsHash);
    }

    /// @dev Called atomically by the module before its payment; revert of payment restores reservation.
    function activate(
        bytes32 id,
        bytes32 digest,
        bytes32 paymentId,
        address beneficiary,
        bool settled,
        uint256 minimumCap
    ) external {
        Allocation storage a = allocations[id];
        if (msg.sender != a.module || !modules[msg.sender]) revert Unauthorized();
        if (
            a.state != State.Reserved || a.permitDigest != digest || a.paymentId != paymentId
                || a.beneficiary != beneficiary || a.cap < minimumCap || block.timestamp > a.permitExpiry
                || token.balanceOf(address(this)) < committed
        ) revert InvalidAllocation();
        a.state = settled ? State.Settled : State.Executing;
        if (settled) a.claimDeadline = uint64(block.timestamp) + CLAIM_WINDOW;
        emit Activated(id, settled);
    }

    /// @notice Executing bridge payments stay collateralized indefinitely until destination confirmation.
    function confirmSettlement(bytes32 id, bytes32 receipt) external {
        Allocation storage a = allocations[id];
        if (msg.sender != a.module) revert Unauthorized();
        if (a.state != State.Executing || receipt == 0) revert InvalidState();
        a.state = State.Settled;
        a.claimDeadline = uint64(block.timestamp) + CLAIM_WINDOW;
        emit SettlementRecorded(id, a.claimDeadline, receipt);
    }

    function fileClaim(bytes32 id, bytes32 evidence) external {
        Allocation storage a = allocations[id];
        if (msg.sender != a.beneficiary) revert Unauthorized();
        if (
            (a.state != State.Settled && a.state != State.Executing)
                || (a.state == State.Settled && block.timestamp > a.claimDeadline) || evidence == 0
        ) revert InvalidState();
        a.state = State.Claimed;
        emit ClaimFiled(id, evidence);
    }

    /// @param grossLoss Reviewer-adjudicated loss before independently recovered funds.
    function resolveClaim(bytes32 id, uint256 grossLoss, uint256 recovery, bytes32 determination)
        external
        nonReentrant
    {
        if (msg.sender != reviewer) revert Unauthorized();
        Allocation storage a = allocations[id];
        if (a.state != State.Claimed || recovery > grossLoss || determination == 0) revert InvalidState();
        uint256 payout = grossLoss - recovery;
        if (payout > a.cap) revert InvalidAllocation();
        a.state = State.Closed;
        committed -= a.cap;
        totalPaid += payout;
        if (payout != 0) token.safeTransfer(a.beneficiary, payout);
        emit ClaimResolved(id, grossLoss, recovery, payout, determination);
    }

    /// @notice Reserved permits must have expired; pending executions/claims can never be released here.
    function release(bytes32 id) external {
        Allocation storage a = allocations[id];
        if (!((a.state == State.Reserved && block.timestamp > a.permitExpiry)
                    || (a.state == State.Settled && block.timestamp > a.claimDeadline))) revert InvalidState();
        a.state = State.Closed;
        committed -= a.cap;
        emit Released(id);
    }

    function withdrawSurplus(address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != administrator) revert Unauthorized();
        if (recipient == address(0) || amount > freeCapacity()) revert InsufficientCapacity();
        token.safeTransfer(recipient, amount);
        emit Withdrawn(recipient, amount);
    }
}
