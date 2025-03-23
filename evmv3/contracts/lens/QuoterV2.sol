// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface ITokenRegister {
    function getVaultBalance(address _token, uint256 _chainId) external view returns (uint256);

    function getTransferFeeV3(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 totalFee, uint256 baseFee, uint256 bridgeFee);

    function getTransferInFee(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _fromChain
    ) external view returns (uint256 bridgeFee);

    function getTransferOutFee(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (address baseReceiver, uint256 baseFee, uint256 bridgeFee);
}

interface ISwap {
    function getAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external view returns (uint256 amountOut);
    function getAmountIn(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountOut
    ) external view returns (uint256 amountIn);
}

interface AffiliateFeeManager {
    function getAffiliatesFee(uint256 amount, bytes calldata feeData) external view returns (uint256 totalFee);
}

contract QuoterV2 is Ownable2Step {
    ISwap public swap;
    ITokenRegister public tokenRegister;
    AffiliateFeeManager public affiliateFeeManager;

    uint256 public immutable selfChainId = block.chainid;

    event Set(ITokenRegister _tokenRegister, ISwap _swap, AffiliateFeeManager _affiliateFeeManager);

    constructor(
        ITokenRegister _tokenRegister,
        ISwap _swap,
        AffiliateFeeManager _affiliateFeeManager
    ) Ownable(msg.sender) {
        _set(_tokenRegister, _swap, _affiliateFeeManager);
    }

    function set(
        ITokenRegister _tokenRegister,
        ISwap _swap,
        AffiliateFeeManager _affiliateFeeManager
    ) external onlyOwner {
        _set(_tokenRegister, _swap, _affiliateFeeManager);
    }

    function _set(ITokenRegister _tokenRegister, ISwap _swap, AffiliateFeeManager _affiliateFeeManager) internal {
        swap = _swap;
        tokenRegister = _tokenRegister;
        affiliateFeeManager = _affiliateFeeManager;
        emit Set(_tokenRegister, _swap, _affiliateFeeManager);
    }

    function quote(
        bytes memory _caller,
        uint256 _fromChain,
        uint256 _toChain,
        address _bridgeInToken,
        address _bridgeOutToken,
        uint256 _bridgeAmount,
        bool _exactIn,
        bool _withSwap,
        bytes calldata _affiliateFee
    )
        external
        view
        returns (
            uint256 bridgeInFee,
            uint256 bridgeOutFee,
            uint256 _bridgeOutOrInAmount,
            uint256 vaultBalance,
            uint256 affiliateFee
        )
    {
        require(_toChain != _fromChain);
        require(_exactIn, "unsupported");
        return
            exactIn(
                _caller,
                _fromChain,
                _toChain,
                _bridgeInToken,
                _bridgeOutToken,
                _bridgeAmount,
                _withSwap,
                _affiliateFee
            );
    }

    function exactIn(
        bytes memory _caller,
        uint256 _fromChain,
        uint256 _toChain,
        address _bridgeInToken,
        address _bridgeOutToken,
        uint256 _bridgeAmount,
        bool _withSwap,
        bytes calldata _affiliateFee
    )
        internal
        view
        returns (
            uint256 bridgeInFee,
            uint256 bridgeOutFee,
            uint256 _bridgeOutOrInAmount,
            uint256 vaultBalance,
            uint256 affiliateFee
        )
    {
        vaultBalance = tokenRegister.getVaultBalance(_bridgeOutToken, _toChain);
        if (_fromChain == selfChainId) {
            _bridgeOutOrInAmount = _bridgeAmount;
            if (_affiliateFee.length != 0) {
                affiliateFee = affiliateFeeManager.getAffiliatesFee(_bridgeOutOrInAmount, _affiliateFee);
                _bridgeOutOrInAmount = (_bridgeOutOrInAmount < affiliateFee) ? 0 : (_bridgeOutOrInAmount - affiliateFee);
            }
            if (_bridgeOutOrInAmount != 0) {
                (bridgeOutFee, , ) = tokenRegister.getTransferFeeV3(
                    _caller,
                    _bridgeOutToken,
                    _bridgeOutOrInAmount,
                    _fromChain,
                    _toChain,
                    _withSwap
                );
                _bridgeOutOrInAmount = (_bridgeOutOrInAmount < bridgeOutFee) ? 0 : (_bridgeOutOrInAmount - bridgeOutFee);
            }
        } else if (_toChain == selfChainId) {
            _bridgeOutOrInAmount = _bridgeAmount;
            if (_affiliateFee.length != 0) {
                affiliateFee = affiliateFeeManager.getAffiliatesFee(_bridgeOutOrInAmount, _affiliateFee);
                _bridgeOutOrInAmount = (_bridgeOutOrInAmount < affiliateFee) ? 0 : (_bridgeOutOrInAmount - affiliateFee);
            }
            if (_bridgeOutOrInAmount != 0) {
                (bridgeInFee, , ) = tokenRegister.getTransferFeeV3(
                    _caller,
                    _bridgeInToken,
                    _bridgeOutOrInAmount,
                    _fromChain,
                    _toChain,
                    _withSwap
                );
                _bridgeOutOrInAmount = (_bridgeOutOrInAmount < bridgeInFee) ? 0 : (_bridgeOutOrInAmount - bridgeInFee);
            }
        } else {
            bridgeInFee = tokenRegister.getTransferInFee(_caller, _bridgeInToken, _bridgeAmount, _fromChain);
            _bridgeOutOrInAmount = (_bridgeAmount < bridgeInFee) ? 0 : (_bridgeAmount - bridgeInFee);
            if ((_bridgeOutOrInAmount != 0) && (_affiliateFee.length != 0)) {
                affiliateFee = affiliateFeeManager.getAffiliatesFee(_bridgeOutOrInAmount, _affiliateFee);
                _bridgeOutOrInAmount -= affiliateFee;
            }
            if (_bridgeOutOrInAmount != 0 && _bridgeInToken != _bridgeOutToken) {
                _bridgeOutOrInAmount = swap.getAmountOut(_bridgeInToken, _bridgeOutToken, _bridgeOutOrInAmount);
            }
            uint256 baseFee;
            uint256 proportionFee;
            (, baseFee, proportionFee) = tokenRegister.getTransferOutFee(
                _caller,
                _bridgeOutToken,
                _bridgeOutOrInAmount,
                _fromChain,
                _toChain,
                _withSwap
            );
            bridgeOutFee = baseFee + proportionFee;
            _bridgeOutOrInAmount = (_bridgeOutOrInAmount < bridgeOutFee) ? 0 : (_bridgeOutOrInAmount - bridgeOutFee);
        }
    }
}
