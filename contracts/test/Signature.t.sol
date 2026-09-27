// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ModuleFixture} from "./CountersignModule.t.sol";
import {CountersignModule} from "../src/CountersignModule.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Verifier1271 {
    address signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 digest, bytes memory signature) external view returns (bytes4) {
        return ECDSA.recover(digest, signature) == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract SignatureTest is ModuleFixture {
    function testEip1271Verifier() public {
        Verifier1271 verifierContract = new Verifier1271(verifier);
        vm.prank(address(safe));
        module.configure(
            executor,
            address(verifierContract),
            CountersignModule.Policy(1000, 1500, 10000, 100, uint64(block.timestamp + 365 days), false)
        );
        execute(permit(700, 1));
        assertEq(token.balanceOf(vendor), 700);
    }

    function testDigestMatchesFlatEip712Encoding() public view {
        CountersignModule.PaymentPermit memory p = permit(700, 1);
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Countersign"),
                keccak256("1"),
                block.chainid,
                address(module)
            )
        );
        bytes32 flat = keccak256(
            abi.encode(
                module.PERMIT_TYPEHASH(),
                p.schemaVersion,
                p.chainId,
                p.safe,
                p.module,
                p.policyEpoch,
                p.engagementId,
                p.engagementVersion,
                p.obligationId,
                p.allocationId,
                p.paymentId,
                p.sourceChainId,
                p.destinationChainId,
                p.recipient,
                p.token,
                p.amount,
                p.maxFee,
                p.route,
                p.evidenceCommitment,
                p.expiresAt,
                p.nonce,
                p.coverageId,
                p.destinationDomain,
                p.minFinalityThreshold
            )
        );
        assertEq(module.permitDigest(p), keccak256(abi.encodePacked(hex"1901", domain, flat)));
    }
}
