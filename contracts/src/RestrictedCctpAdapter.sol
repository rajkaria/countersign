// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;
}

/// @notice Single-purpose CCTP V2 burn; no hooks, arbitrary calls, or persistent allowances.
contract RestrictedCctpAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable module;
    IERC20 public immutable token;
    address public immutable messenger;
    error Unauthorized();
    error InvalidRoute();
    event BurnSubmitted(bytes32 indexed paymentId, uint32 domain, address recipient, uint256 amount, uint256 maxFee);

    constructor(address module_, address token_, address messenger_) {
        if (module_.code.length == 0 || token_.code.length == 0 || messenger_.code.length == 0) revert InvalidRoute();
        module = module_;
        token = IERC20(token_);
        messenger = messenger_;
    }

    function burn(bytes32 paymentId, uint256 amount, uint32 domain, address recipient, uint256 maxFee, uint32 finality)
        external
        nonReentrant
    {
        if (msg.sender != module) revert Unauthorized();
        if (amount == 0 || maxFee >= amount || recipient == address(0) || finality != 2000) revert InvalidRoute();
        uint256 beforeBalance = token.balanceOf(address(this));
        if (beforeBalance < amount) revert InvalidRoute();
        token.forceApprove(messenger, amount);
        ITokenMessengerV2(messenger)
            .depositForBurn(
                amount, domain, bytes32(uint256(uint160(recipient))), address(token), bytes32(0), maxFee, finality
            );
        token.forceApprove(messenger, 0);
        if (token.balanceOf(address(this)) != beforeBalance - amount) revert InvalidRoute();
        emit BurnSubmitted(paymentId, domain, recipient, amount, maxFee);
    }
}
