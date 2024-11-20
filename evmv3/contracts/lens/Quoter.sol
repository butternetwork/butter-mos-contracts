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

contract Quoter is Ownable2Step {
    ISwap public swap;
    ITokenRegister public tokenRegister;

    uint256 public immutable selfChainId = block.chainid;

    event Set(ITokenRegister _tokenRegister, ISwap _swap);

    constructor(ITokenRegister _tokenRegister, ISwap _swap) Ownable(msg.sender) {
        _set(_tokenRegister, _swap);
    }

    function set(ITokenRegister _tokenRegister, ISwap _swap) external onlyOwner {
        _set(_tokenRegister, _swap);
    }

    function _set(ITokenRegister _tokenRegister, ISwap _swap) internal {
        swap = _swap;
        tokenRegister = _tokenRegister;
        emit Set(_tokenRegister, _swap);
    }

    function quote(
        bytes memory _caller,
        uint256 _fromChain,
        uint256 _toChain,
        address _bridgeInToken,
        address _bridgeOutToken,
        uint256 _bridgeAmount,
        bool _exactIn,
        bool _withSwap
    )
        external
        view
        returns (uint256 bridgeInFee, uint256 bridgeOutFee, uint256 _bridgeOutOrInAmount, uint256 vaultBalance)
    {
        require(_toChain != _fromChain);
        require(_exactIn, "unsupported");
        return exactIn(_caller, _fromChain, _toChain, _bridgeInToken, _bridgeOutToken, _bridgeAmount, _withSwap);
    }

    function exactIn(
        bytes memory _caller,
        uint256 _fromChain,
        uint256 _toChain,
        address _bridgeInToken,
        address _bridgeOutToken,
        uint256 _bridgeAmount,
        bool _withSwap
    )
        internal
        view
        returns (uint256 bridgeInFee, uint256 bridgeOutFee, uint256 _bridgeOutOrInAmount, uint256 vaultBalance)
    {
        vaultBalance = tokenRegister.getVaultBalance(_bridgeOutToken, _toChain);
        if (_fromChain == selfChainId) {
            (bridgeOutFee, , ) = tokenRegister.getTransferFeeV3(
                _caller,
                _bridgeOutToken,
                _bridgeAmount,
                _fromChain,
                _toChain,
                _withSwap
            );
            if (_bridgeAmount < bridgeOutFee) {
                bridgeOutFee = _bridgeAmount;
            }
            _bridgeOutOrInAmount = _bridgeAmount - bridgeOutFee;
        } else if (_toChain == selfChainId) {
            (bridgeInFee, , ) = tokenRegister.getTransferFeeV3(
                _caller,
                _bridgeInToken,
                _bridgeAmount,
                _fromChain,
                _toChain,
                _withSwap
            );
            if (_bridgeAmount < bridgeInFee) {
                bridgeInFee = _bridgeAmount;
            }
            _bridgeOutOrInAmount = _bridgeAmount - bridgeInFee;
        } else {
            bridgeInFee = tokenRegister.getTransferInFee(_caller, _bridgeInToken, _bridgeAmount, _fromChain);
            if (_bridgeAmount < bridgeInFee) {
                bridgeInFee = _bridgeAmount;
            }
            _bridgeOutOrInAmount = _bridgeAmount - bridgeInFee;
            if (_bridgeOutOrInAmount != 0) {
                if (_bridgeInToken != _bridgeOutToken) {
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
                if (_bridgeOutOrInAmount < bridgeOutFee) {
                    bridgeOutFee = _bridgeOutOrInAmount;
                }
                _bridgeOutOrInAmount = _bridgeOutOrInAmount - bridgeOutFee;
            }
        }
    }
}
