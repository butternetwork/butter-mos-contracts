// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

interface ITokenRegister {
    function getTargetToken(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toToken, uint8 decimals, bool mintable);
}

contract SwapDataValidatorV2 {
    uint256 public immutable selfChainId = block.chainid;

    ITokenRegister register;
    struct Param {
        bool relay;
        uint256 dstChain;
        bytes dstToken;
        bytes dstReceiver;
        uint256 dstMinAmount;
        bytes swapData;
    }
    struct SwapParam {
        address dstToken;
        address receiver;
        address leftReceiver;
        uint256 minAmount;
        SwapData[] swaps;
    }
    struct SwapData {
        uint8 dexType;
        address callTo;
        address approveTo;
        uint256 fromAmount;
        bytes callData;
    }

    constructor(ITokenRegister _register) {
        register = _register;
    }

    function validate(Param memory param) external view returns (bool) {
        bytes memory receiver;
        address relayToken;
        uint256 minOut;
        if (param.relay) {
            (relayToken, minOut, receiver, param.swapData) = this.getRelaySwapData(param.swapData);
        }
        if (param.swapData.length == 0) {
            if (relayToken != address(0)) {
                bytes memory dstTokenBytes;
                (dstTokenBytes, , ) = register.getTargetToken(
                    selfChainId,
                    param.dstChain,
                    abi.encodePacked(relayToken)
                );
                return (_checkBytes(receiver, param.dstReceiver) &&
                    minOut >= param.dstMinAmount &&
                    _checkBytes(dstTokenBytes, param.dstToken));
            } else {
                return _checkBytes(receiver, param.dstReceiver);
            }
        } else {
            (bytes memory _swapData, ) = abi.decode(param.swapData, (bytes, bytes));
            if (_swapData.length == 0) return false;
            SwapParam memory swap = abi.decode(_swapData, (SwapParam));
            return (_checkBytes(abi.encodePacked(swap.receiver), param.dstReceiver) &&
                _checkBytes(abi.encodePacked(swap.dstToken), param.dstToken) &&
                swap.minAmount >= param.dstMinAmount);
        }
    }

    function _checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        return keccak256(b1) == keccak256(b2);
    }

    function getRelaySwapData(
        bytes calldata data
    ) external pure returns (address relayToken, uint256 minOut, bytes memory receiver, bytes memory swapData) {
        uint256 offset;
        uint256 len = uint256(uint8(bytes1(data[offset:(offset += 1)])));
        offset += len * 4;
        uint8 needSwap = uint8(bytes1(data[offset:(offset += 1)]));
        if (needSwap != 0) {
            (relayToken, minOut, receiver, swapData) = abi.decode(data[offset:], (address, uint256, bytes, bytes));
        } else {
            (receiver, swapData) = abi.decode(data[offset:], (bytes, bytes));
        }
    }
}
