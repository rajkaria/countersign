// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ModuleFixture, Token} from "./CountersignModule.t.sol";
import {CountersignModule} from "../src/CountersignModule.sol";
import {ReservedProtection} from "../src/ReservedProtection.sol";

contract PaymentHandler is Test {
    CountersignModule public immutable module;
    uint256 public nonce;
    uint256 public effects;
    uint256 public successCount;

    constructor(CountersignModule module_) {
        module = module_;
    }

    function pay(uint96 amount_, uint32 advance_) external {
        uint256 amount = bound(amount_, 1, 2000);
        vm.warp(block.timestamp + bound(advance_, 0, 2 days));
        CountersignModule.PaymentPermit memory p;
        p.schemaVersion = 1;
        p.chainId = block.chainid;
        p.safe = module.safe();
        p.module = address(module);
        p.policyEpoch = module.policyEpoch();
        p.engagementId = keccak256("engagement");
        p.engagementVersion = 1;
        p.obligationId = keccak256("obligation");
        p.allocationId = keccak256(abi.encode("a", nonce));
        p.paymentId = keccak256(abi.encode("p", nonce));
        p.sourceChainId = block.chainid;
        p.destinationChainId = block.chainid;
        p.recipient = address(0x456);
        p.token = address(module.token());
        p.amount = amount;
        p.route = module.DIRECT_ROUTE();
        p.evidenceCommitment = keccak256("evidence");
        p.expiresAt = uint64(block.timestamp + 1 days);
        p.nonce = nonce++;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x123456, module.permitDigest(p));
        try module.execute(p, abi.encodePacked(r, s, v)) {
            effects += amount;
            successCount++;
        } catch {}
    }
}

contract PaymentInvariants is StdInvariant, ModuleFixture {
    PaymentHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new PaymentHandler(module);
        vm.prank(address(safe));
        module.configure(
            address(handler),
            verifier,
            CountersignModule.Policy(1000, 1500, 10000, 100, uint64(block.timestamp + 365 days), false)
        );
        targetContract(address(handler));
    }

    function invariant_ExactEffectsAndObligationCeiling() public view {
        assertEq(token.balanceOf(vendor), handler.effects());
        assertEq(module.totalSpent(), handler.effects());
        assertEq(module.obligationPaid(obligation), handler.effects());
        assertLe(module.obligationPaid(obligation), 5000);
        assertLe(module.rollingSpent(), 1500);
        assertGe(token.balanceOf(address(safe)), 100);
    }
}

contract ReviewerActor {
    function resolve(ReservedProtection reserve, bytes32 id, uint256 payout) external {
        reserve.resolveClaim(id, payout, 0, keccak256("determination"));
    }
}

contract ReserveHandler is Test {
    ReservedProtection public reserve;
    ReviewerActor public reviewer;
    bytes32[] public ids;
    uint256 public nonce;

    constructor() {
        reviewer = new ReviewerActor();
    }

    function initialize(ReservedProtection r) external {
        require(address(reserve) == address(0));
        reserve = r;
    }

    function allocate(uint96 cap_) external {
        bytes32 id = bytes32(++nonce);
        uint256 cap = bound(cap_, 1, 15000);
        try reserve.allocate(
            id,
            address(this),
            keccak256(abi.encode(id)),
            id,
            address(this),
            cap,
            uint64(block.timestamp + 1 days),
            keccak256("terms")
        ) {
            ids.push(id);
        } catch {}
    }

    function progress(uint32 pick_, uint8 action_, uint32 advance_, uint96 payout_) external {
        vm.warp(block.timestamp + bound(advance_, 0, 2 days));
        if (ids.length == 0) return;
        bytes32 id = ids[pick_ % ids.length];
        uint8 action = action_ % 5;
        if (action == 0) {
            try reserve.activate(id, keccak256(abi.encode(id)), id, address(this), true, 0) {} catch {}
        } else if (action == 1) {
            try reserve.fileClaim(id, keccak256("claim")) {} catch {}
        } else if (action == 2) {
            try reviewer.resolve(reserve, id, bound(payout_, 0, 10000)) {} catch {}
        } else if (action == 3) {
            try reserve.release(id) {} catch {}
        } else {
            try reserve.withdrawSurplus(address(this), bound(payout_, 0, 10000)) {} catch {}
        }
    }

    function activeLiability() external view returns (uint256 total) {
        for (uint256 i; i < ids.length; i++) {
            (,,,, uint256 cap,,, ReservedProtection.State state,) = reserve.allocations(ids[i]);
            if (state != ReservedProtection.State.Closed) total += cap;
        }
    }
}

contract ReserveInvariants is StdInvariant, Test {
    Token token;
    ReservedProtection reserve;
    ReserveHandler handler;

    function setUp() public {
        vm.warp(100 days);
        token = new Token();
        handler = new ReserveHandler();
        reserve =
            new ReservedProtection(address(token), address(handler), address(handler), address(handler.reviewer()));
        handler.initialize(reserve);
        vm.prank(address(handler));
        reserve.setModule(address(handler), true);
        token.mint(address(reserve), 10000);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = ReserveHandler.allocate.selector;
        selectors[1] = ReserveHandler.progress.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function invariant_FullCollateralAndConservation() public view {
        assertLe(reserve.committed(), token.balanceOf(address(reserve)));
        assertEq(reserve.committed(), handler.activeLiability());
        assertEq(token.balanceOf(address(reserve)) + token.balanceOf(address(handler)), 10000);
        assertLe(reserve.totalPaid(), 10000);
    }
}
