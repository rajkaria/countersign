// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ModuleFixture, Token} from "./CountersignModule.t.sol";
import {CountersignModule} from "../src/CountersignModule.sol";
import {RestrictedCctpAdapter} from "../src/RestrictedCctpAdapter.sol";
import {ReservedProtection} from "../src/ReservedProtection.sol";

contract MessengerMock {
    uint256 public amount;
    uint32 public domain;
    bytes32 public recipient;
    uint256 public fee;
    uint32 public finality;
    bool public fail;

    function setFail(bool value) external {
        fail = value;
    }

    function depositForBurn(
        uint256 amount_,
        uint32 domain_,
        bytes32 recipient_,
        address token,
        bytes32 caller,
        uint256 fee_,
        uint32 finality_
    ) external {
        require(!fail && caller == bytes32(0));
        amount = amount_;
        domain = domain_;
        recipient = recipient_;
        fee = fee_;
        finality = finality_;
        require(Token(token).transferFrom(msg.sender, address(this), amount_));
    }
}

contract CctpTest is ModuleFixture {
    RestrictedCctpAdapter adapter;
    MessengerMock messenger;

    function setUp() public override {
        super.setUp();
        messenger = new MessengerMock();
        adapter = new RestrictedCctpAdapter(address(module), address(token), address(messenger));
        vm.startPrank(address(safe));
        module.setRoute(8453, address(adapter), 6, true);
        module.setEngagement(
            keccak256("bridge"), CountersignModule.Engagement(1, vendor, 8453, 1000, 1500, 10000, true)
        );
        module.setObligation(keccak256("bridgeObligation"), keccak256("bridge"), 5000);
        vm.stopPrank();
    }

    function bridgePermit() internal view returns (CountersignModule.PaymentPermit memory p) {
        p = permit(700, 50);
        p.engagementId = keccak256("bridge");
        p.obligationId = keccak256("bridgeObligation");
        p.destinationChainId = 8453;
        p.destinationDomain = 6;
        p.minFinalityThreshold = 2000;
        p.route = module.CCTP_ROUTE();
        p.maxFee = 5;
    }

    function testBridgeBindsCallAndRetainsPendingCoverage() public {
        CountersignModule.PaymentPermit memory p = bridgePermit();
        p.coverageId = keccak256("bridgeCover");
        reserve.allocate(
            p.coverageId,
            address(module),
            module.permitDigest(p),
            p.paymentId,
            address(safe),
            700,
            p.expiresAt,
            keccak256("terms")
        );
        execute(p);
        assertEq(messenger.amount(), 700);
        assertEq(messenger.domain(), 6);
        assertEq(messenger.recipient(), bytes32(uint256(uint160(vendor))));
        assertEq(messenger.fee(), 5);
        assertEq(messenger.finality(), 2000);
        assertEq(token.allowance(address(adapter), address(messenger)), 0);
        assertEq(token.balanceOf(vendor), 0);
        assertEq(reserve.committed(), 700);
        vm.warp(block.timestamp + 60 days);
        vm.expectRevert(ReservedProtection.InvalidState.selector);
        reserve.release(p.coverageId);
        vm.prank(executor);
        vm.expectRevert(CountersignModule.OnlyVerifier.selector);
        module.confirmDestination(p.paymentId, keccak256("receipt"));
        vm.prank(verifier);
        module.confirmDestination(p.paymentId, keccak256("receipt"));
        vm.expectRevert(ReservedProtection.InvalidState.selector);
        reserve.release(p.coverageId);
        vm.warp(block.timestamp + 14 days + 1);
        reserve.release(p.coverageId);
        assertEq(reserve.committed(), 0);
    }

    function testWrongBridgeDomainAndFinality() public {
        CountersignModule.PaymentPermit memory p = bridgePermit();
        p.destinationDomain = 7;
        reject(p, CountersignModule.UnsupportedRoute.selector);
        p = bridgePermit();
        p.minFinalityThreshold = 1000;
        reject(p, CountersignModule.UnsupportedRoute.selector);
    }

    function testNoDirectAdapterAuthority() public {
        vm.prank(executor);
        vm.expectRevert(RestrictedCctpAdapter.Unauthorized.selector);
        adapter.burn(bytes32(0), 1, 6, vendor, 0, 2000);
    }

    function testBridgeFailureRollsBackAllEffects() public {
        messenger.setFail(true);
        CountersignModule.PaymentPermit memory p = bridgePermit();
        bytes memory sig = signature(p);
        vm.prank(executor);
        vm.expectRevert();
        module.execute(p, sig);
        assertEq(module.totalSpent(), 0);
        assertEq(token.balanceOf(address(safe)), 20000);
        assertEq(token.balanceOf(address(adapter)), 0);
        assertFalse(module.usedNonce(50));
    }
}
