// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ModuleFixture} from "./CountersignModule.t.sol";
import {CountersignModule} from "../src/CountersignModule.sol";
import {ReservedProtection} from "../src/ReservedProtection.sol";

contract AdversarialTest is ModuleFixture {
    function testDifferentPaymentCannotReuseInstallment() public {
        CountersignModule.PaymentPermit memory p = permit(400, 1);
        execute(p);
        CountersignModule.PaymentPermit memory q = permit(400, 2);
        q.allocationId = p.allocationId;
        reject(q, CountersignModule.Replay.selector);
    }

    function testObligationCeilingAcrossPayments() public {
        vm.prank(address(safe));
        module.setObligation(obligation, engagement, 800);
        execute(permit(500, 1));
        reject(permit(301, 2), CountersignModule.CapExceeded.selector);
        execute(permit(300, 2));
        assertEq(module.obligationPaid(obligation), 800);
    }

    function testObligationCannotBeReassignedOrResetBelowPaid() public {
        execute(permit(500, 1));
        vm.prank(address(safe));
        vm.expectRevert(CountersignModule.InvalidConfiguration.selector);
        module.setObligation(obligation, engagement, 499);
        vm.startPrank(address(safe));
        module.setEngagement(
            bytes32(uint256(1)), CountersignModule.Engagement(1, vendor, block.chainid, 1000, 1500, 10000, true)
        );
        vm.expectRevert(CountersignModule.InvalidConfiguration.selector);
        module.setObligation(obligation, bytes32(uint256(1)), 800);
        vm.stopPrank();
    }

    function testEngagementChangeInvalidatesAndRetainsSpending() public {
        execute(permit(500, 1));
        CountersignModule.PaymentPermit memory p = permit(500, 2);
        vm.prank(address(safe));
        module.setEngagement(
            engagement, CountersignModule.Engagement(2, vendor, block.chainid, 1000, 1500, 10000, true)
        );
        reject(p, CountersignModule.InvalidPermit.selector);
        p = permit(500, 2);
        reject(p, CountersignModule.InvalidPermit.selector);
        p.engagementVersion = 2;
        execute(p);
        assertEq(module.engagementSpent(engagement), 1000);
    }

    function testEpochDoesNotResetRollingOrLifetime() public {
        execute(permit(1000, 1));
        vm.prank(address(safe));
        module.configure(
            executor,
            verifier,
            CountersignModule.Policy(1000, 1500, 1200, 100, uint64(block.timestamp + 365 days), false)
        );
        reject(permit(201, 2), CountersignModule.CapExceeded.selector);
        execute(permit(200, 2));
        assertEq(module.totalSpent(), 1200);
    }

    function testIndependentRevocation() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        bytes memory sig = signature(p);
        vm.prank(address(safe));
        module.revoke();
        vm.prank(executor);
        vm.expectRevert(CountersignModule.OnlyExecutor.selector);
        module.execute(p, sig);
        vm.prank(address(safe));
        module.configure(
            executor,
            verifier,
            CountersignModule.Policy(1000, 1500, 10000, 100, uint64(block.timestamp + 365 days), false)
        );
        reject(p, CountersignModule.InvalidPermit.selector);
    }

    function testOwnersCanDisableModuleAtSafe() public {
        safe.disable();
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        bytes memory sig = signature(p);
        vm.prank(executor);
        vm.expectRevert();
        module.execute(p, sig);
        assertEq(module.totalSpent(), 0);
        assertEq(token.balanceOf(address(safe)), 20000);
    }

    function testVerifierCannotExecuteAndExecutorCannotVerify() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        bytes memory sig = signature(p);
        vm.prank(verifier);
        vm.expectRevert(CountersignModule.OnlyExecutor.selector);
        module.execute(p, sig);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x999, module.permitDigest(p));
        vm.prank(executor);
        vm.expectRevert(CountersignModule.InvalidSignature.selector);
        module.execute(p, abi.encodePacked(r, s, v));
    }

    function testFuzz_SecurityFieldsBound(uint8 field) public {
        CountersignModule.PaymentPermit memory p = permit(100, 1);
        bytes memory sig = signature(p);
        field = uint8(bound(field, 0, 22));
        if (field == 0) p.schemaVersion++;
        else if (field == 1) p.chainId++;
        else if (field == 2) p.safe = address(99);
        else if (field == 3) p.module = address(99);
        else if (field == 4) p.policyEpoch++;
        else if (field == 5) p.engagementId = bytes32(uint256(99));
        else if (field == 6) p.engagementVersion++;
        else if (field == 7) p.obligationId = bytes32(uint256(99));
        else if (field == 8) p.allocationId = bytes32(uint256(99));
        else if (field == 9) p.paymentId = bytes32(uint256(99));
        else if (field == 10) p.sourceChainId++;
        else if (field == 11) p.destinationChainId++;
        else if (field == 12) p.recipient = address(99);
        else if (field == 13) p.token = address(99);
        else if (field == 14) p.amount++;
        else if (field == 15) p.maxFee++;
        else if (field == 16) p.route = bytes32(uint256(99));
        else if (field == 17) p.evidenceCommitment = bytes32(uint256(99));
        else if (field == 18) p.expiresAt++;
        else if (field == 19) p.nonce++;
        else if (field == 20) p.coverageId = bytes32(uint256(99));
        else if (field == 21) p.destinationDomain++;
        else p.minFinalityThreshold++;
        vm.prank(executor);
        vm.expectRevert();
        module.execute(p, sig);
        assertEq(module.totalSpent(), 0);
    }

    function testCoveredOnlyRequiresFullCap() public {
        vm.prank(address(safe));
        module.configure(
            executor,
            verifier,
            CountersignModule.Policy(1000, 1500, 10000, 100, uint64(block.timestamp + 365 days), true)
        );
        reject(permit(700, 1), CountersignModule.InvalidPermit.selector);
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.coverageId = keccak256("cover");
        reserve.allocate(
            p.coverageId,
            address(module),
            module.permitDigest(p),
            p.paymentId,
            address(safe),
            699,
            p.expiresAt,
            keccak256("terms")
        );
        bytes memory sig = signature(p);
        vm.prank(executor);
        vm.expectRevert(ReservedProtection.InvalidAllocation.selector);
        module.execute(p, sig);
        assertEq(reserve.committed(), 699);
        assertEq(module.totalSpent(), 0);
    }

    function testReserveCannotBeWithdrawnOrDoubleAllocated() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.coverageId = keccak256("cover");
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
        bytes32 digest = module.permitDigest(p);
        vm.expectRevert(ReservedProtection.InvalidAllocation.selector);
        reserve.allocate(
            keccak256("other"),
            address(module),
            digest,
            p.paymentId,
            address(safe),
            700,
            p.expiresAt,
            keccak256("terms")
        );
        vm.expectRevert(ReservedProtection.InsufficientCapacity.selector);
        reserve.withdrawSurplus(address(this), 9301);
        reserve.withdrawSurplus(address(this), 9300);
        assertEq(token.balanceOf(address(reserve)), 700);
        vm.expectRevert(ReservedProtection.InsufficientCapacity.selector);
        reserve.allocate(
            keccak256("other"),
            address(module),
            keccak256("digest"),
            keccak256("otherpayment"),
            address(safe),
            1,
            p.expiresAt,
            keccak256("terms")
        );
        execute(p);
    }

    function testExpiredReservationCannotFundExecutablePermit() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.coverageId = keccak256("cover");
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
        vm.expectRevert(ReservedProtection.InvalidState.selector);
        reserve.release(p.coverageId);
        vm.warp(p.expiresAt + 1);
        reserve.release(p.coverageId);
        assertEq(reserve.committed(), 0);
        reject(p, CountersignModule.InvalidPermit.selector);
    }

    function testCoverageCannotFollowChangedPermit() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.coverageId = keccak256("cover");
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
        p.amount = 701;
        bytes memory sig = signature(p);
        vm.prank(executor);
        vm.expectRevert(ReservedProtection.InvalidAllocation.selector);
        module.execute(p, sig);
    }

    function testClaimPermissionsLossAndRecoveries() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.coverageId = keccak256("cover");
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
        vm.prank(executor);
        vm.expectRevert(ReservedProtection.Unauthorized.selector);
        reserve.fileClaim(p.coverageId, keccak256("claim"));
        vm.prank(address(safe));
        reserve.fileClaim(p.coverageId, keccak256("claim"));
        vm.expectRevert(ReservedProtection.Unauthorized.selector);
        reserve.resolveClaim(p.coverageId, 700, 0, keccak256("decision"));
        vm.prank(reviewer);
        vm.expectRevert(ReservedProtection.InvalidAllocation.selector);
        reserve.resolveClaim(p.coverageId, 701, 0, keccak256("decision"));
        vm.prank(reviewer);
        reserve.resolveClaim(p.coverageId, 700, 200, keccak256("decision"));
        assertEq(reserve.totalPaid(), 500);
    }
}
