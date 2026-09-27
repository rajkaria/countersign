// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {CountersignModule} from "../src/CountersignModule.sol";
import {ReservedProtection} from "../src/ReservedProtection.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    constructor() ERC20("Test USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SafeMock {
    bool public enabled = true;

    function disable() external {
        enabled = false;
    }

    function execTransactionFromModuleReturnData(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool, bytes memory)
    {
        require(enabled && value == 0 && operation == 0);
        return to.call(data);
    }
}

abstract contract ModuleFixture is Test {
    Token token;
    SafeMock safe;
    CountersignModule module;
    ReservedProtection reserve;
    uint256 verifierKey = 0x123456;
    address verifier;
    address executor = address(0x123);
    address vendor = address(0x456);
    address reviewer = address(0x789);
    bytes32 engagement = keccak256("engagement");
    bytes32 obligation = keccak256("obligation");

    function setUp() public virtual {
        vm.warp(100 days);
        verifier = vm.addr(verifierKey);
        token = new Token();
        safe = new SafeMock();
        reserve = new ReservedProtection(address(token), address(this), address(this), reviewer);
        module = new CountersignModule(address(safe), address(token), address(reserve));
        reserve.setModule(address(module), true);
        vm.startPrank(address(safe));
        module.configure(
            executor,
            verifier,
            CountersignModule.Policy(1000, 1500, 10000, 100, uint64(block.timestamp + 365 days), false)
        );
        module.setEngagement(
            engagement, CountersignModule.Engagement(1, vendor, block.chainid, 1000, 1500, 10000, true)
        );
        module.setObligation(obligation, engagement, 5000);
        vm.stopPrank();
        token.mint(address(safe), 20000);
        token.mint(address(reserve), 10000);
    }

    function permit(uint256 amount, uint256 nonce) internal view returns (CountersignModule.PaymentPermit memory p) {
        p.schemaVersion = 1;
        p.chainId = block.chainid;
        p.safe = address(safe);
        p.module = address(module);
        p.policyEpoch = module.policyEpoch();
        p.engagementId = engagement;
        p.engagementVersion = 1;
        p.obligationId = obligation;
        p.allocationId = keccak256(abi.encode("allocation", nonce));
        p.paymentId = keccak256(abi.encode("payment", nonce));
        p.sourceChainId = block.chainid;
        p.destinationChainId = block.chainid;
        p.recipient = vendor;
        p.token = address(token);
        p.amount = amount;
        p.route = module.DIRECT_ROUTE();
        p.evidenceCommitment = keccak256("evidence");
        p.expiresAt = uint64(block.timestamp + 1 days);
        p.nonce = nonce;
    }

    function signature(CountersignModule.PaymentPermit memory p) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, module.permitDigest(p));
        return abi.encodePacked(r, s, v);
    }

    function execute(CountersignModule.PaymentPermit memory p) internal {
        bytes memory sig = signature(p);
        vm.prank(executor);
        module.execute(p, sig);
    }

    function reject(CountersignModule.PaymentPermit memory p, bytes4 reason) internal {
        bytes memory sig = signature(p);
        vm.prank(executor);
        vm.expectRevert(reason);
        module.execute(p, sig);
    }
}

contract ModuleTest is ModuleFixture {
    function testPaymentAndReplay() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        execute(p);
        assertEq(token.balanceOf(vendor), 700);
        assertEq(module.obligationPaid(obligation), 700);
        reject(p, CountersignModule.Replay.selector);
    }

    function testMidnightDoesNotResetRollingCap() public {
        vm.warp(100 days + 23 hours + 59 minutes);
        execute(permit(1000, 1));
        vm.warp(101 days + 1 minutes);
        reject(permit(600, 2), CountersignModule.CapExceeded.selector);
        vm.warp(101 days + 23 hours + 59 minutes);
        execute(permit(600, 2));
        assertEq(module.rollingSpent(), 600);
    }

    function testOnlySafeCanAdminister() public {
        vm.prank(executor);
        vm.expectRevert(CountersignModule.OnlySafe.selector);
        module.pause();
        vm.prank(verifier);
        vm.expectRevert(CountersignModule.OnlySafe.selector);
        module.setObligation(obligation, engagement, 20000);
    }

    function testPolicyChangeInvalidatesPermit() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        vm.prank(address(safe));
        module.pause();
        reject(p, CountersignModule.Paused.selector);
        vm.prank(address(safe));
        module.unpause();
        reject(p, CountersignModule.InvalidPermit.selector);
    }

    function testWrongRecipientAndExpiry() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.recipient = address(99);
        reject(p, CountersignModule.InvalidPermit.selector);
        p = permit(700, 1);
        vm.warp(p.expiresAt + 1);
        reject(p, CountersignModule.InvalidPermit.selector);
    }

    function testTamperedSignature() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        bytes memory sig = signature(p);
        p.amount = 701;
        vm.prank(executor);
        vm.expectRevert(CountersignModule.InvalidSignature.selector);
        module.execute(p, sig);
    }

    function testFuzz_CapCannotBeExceeded(uint128 amount) public {
        vm.assume(amount > 1000);
        reject(permit(amount, 1), CountersignModule.CapExceeded.selector);
        assertEq(module.totalSpent(), 0);
        assertEq(token.balanceOf(vendor), 0);
    }

    function testFuzz_WithinBoundsExactEffect(uint96 amount) public {
        amount = uint96(bound(amount, 1, 1000));
        execute(permit(amount, 1));
        assertEq(token.balanceOf(vendor), amount);
        assertEq(module.totalSpent(), amount);
    }

    function testCashFloor() public {
        vm.prank(address(safe));
        assertTrue(token.transfer(address(99), 19400));
        reject(permit(501, 1), CountersignModule.CashFloor.selector);
    }

    function testReserveBinding() public {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        p.coverageId = keccak256("coverage");
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
        assertEq(reserve.committed(), 700);
        vm.prank(address(safe));
        reserve.fileClaim(p.coverageId, keccak256("loss evidence"));
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(ReservedProtection.InvalidState.selector);
        reserve.release(p.coverageId);
        vm.prank(reviewer);
        reserve.resolveClaim(p.coverageId, 600, 0, keccak256("adjudication"));
        assertEq(reserve.committed(), 0);
        assertEq(reserve.totalPaid(), 600);
        vm.prank(reviewer);
        vm.expectRevert(ReservedProtection.InvalidState.selector);
        reserve.resolveClaim(p.coverageId, 600, 0, bytes32(0));
    }
}
