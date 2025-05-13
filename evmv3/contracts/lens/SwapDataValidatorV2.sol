// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

interface ITokenRegister {
    function getTargetToken(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toToken, uint8 decimals, bool mintable);

    function getToChainAmount(
        address _token,
        uint256 _amount,
        uint256 _toChain
    ) external view returns (uint256);
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
                minOut = register.getToChainAmount(relayToken, minOut, param.dstChain);
                if(_checkBytes(abi.encodePacked(address(0)), param.dstToken)){
                    return (_checkBytes(receiver, param.dstReceiver) &&
                        minOut >= param.dstMinAmount &&
                        _isWToken(param.dstChain, dstTokenBytes));
                } else {
                    return (_checkBytes(receiver, param.dstReceiver) &&
                        minOut >= param.dstMinAmount &&
                        _checkBytes(dstTokenBytes, param.dstToken));
                }
            } else {
                return _checkBytes(receiver, param.dstReceiver);
            }
        } else {
            //dstChain -> solana
            if(param.dstChain == 1360108768460801) {
                bytes memory dstToken;
                (dstToken, receiver, minOut) = this.decodeSolanaSwapData(param.swapData);
                return (_checkBytes(receiver, param.dstReceiver) &&
                    _checkBytes(dstToken, param.dstToken) &&
                    minOut >= param.dstMinAmount);
            } else {
                (bytes memory _swapData, ) = abi.decode(param.swapData, (bytes, bytes));
                if (_swapData.length == 0) return false;
                SwapParam memory swap = abi.decode(_swapData, (SwapParam));
                return (_checkBytes(abi.encodePacked(swap.receiver), param.dstReceiver) &&
                    _checkBytes(abi.encodePacked(swap.dstToken), param.dstToken) &&
                    swap.minAmount >= param.dstMinAmount);
            }
        }
    }

    function _isWToken(uint256 dstChain, bytes memory dstTokenBytes) internal pure returns(bool) {
        if(dstChain == 22776) {
            return _checkBytes(abi.encodePacked(0x13CB04d4a5Dfb6398Fc5AB005a6c84337256eE23), dstTokenBytes);
        } else if(dstChain == 1) {
            return _checkBytes(abi.encodePacked(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), dstTokenBytes);
        } else if(dstChain == 56) {
            return _checkBytes(abi.encodePacked(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c), dstTokenBytes);
        } else if(dstChain == 137) {
            return _checkBytes(abi.encodePacked(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270), dstTokenBytes);
        } else if(dstChain == 42161) {
            return _checkBytes(abi.encodePacked(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1), dstTokenBytes);
        } else if(dstChain == 8453) {
            return _checkBytes(abi.encodePacked(0x4200000000000000000000000000000000000006), dstTokenBytes);
        } else if(dstChain == 728126428) {
            return _checkBytes(abi.encodePacked(0x891cdb91d149f23B1a45D9c5Ca78a88d0cB44C18), dstTokenBytes);
        } else if(dstChain == 10) {
            return _checkBytes(abi.encodePacked(0x4200000000000000000000000000000000000006), dstTokenBytes);
        } else if(dstChain == 324) {
            return _checkBytes(abi.encodePacked(0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91), dstTokenBytes);
        } else if(dstChain == 81457) {
            return _checkBytes(abi.encodePacked(0x4300000000000000000000000000000000000004), dstTokenBytes);
        } else if(dstChain == 59144) {
            return _checkBytes(abi.encodePacked(0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f), dstTokenBytes);
        } else if(dstChain == 534352) {
            return _checkBytes(abi.encodePacked(0x5300000000000000000000000000000000000004), dstTokenBytes);
        } else if(dstChain == 5000) {
            return _checkBytes(abi.encodePacked(0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8), dstTokenBytes);
        } else if(dstChain == 1030) {
            return _checkBytes(abi.encodePacked(0x14b2D3bC65e74DAE1030EAFd8ac30c533c976A9b), dstTokenBytes);
        } else if(dstChain == 8217) {
            return _checkBytes(abi.encodePacked(0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432), dstTokenBytes);
        } else if(dstChain == 4200) {
            return _checkBytes(abi.encodePacked(0xF6D226f9Dc15d9bB51182815b320D3fBE324e1bA), dstTokenBytes);
        } else if(dstChain == 2649) {
            return _checkBytes(abi.encodePacked(0x1470a4831F76954686BfB4dE8180F7469EA8dE6F), dstTokenBytes);
        } else if(dstChain == 1360108768460801){
             return _checkBytes(hex'069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001', dstTokenBytes);
        } else if(dstChain == 1360095883558913) {
            return _checkBytes(hex'425443', dstTokenBytes);
        } else {
            return false;
        }
    }

    //1 bytes dstToken len
    //1 bytes receiver len
    //bytes dstToken
    //bytes receiver
    //uint256 minAmountOut 
    function decodeSolanaSwapData(
        bytes calldata _swapData
    ) external pure returns (bytes memory dstToken, bytes memory receiver, uint256 minAmountOut) {
        dstToken = _swapData[2:34];
        receiver = _swapData[34:66];
        minAmountOut = uint256(bytes32(_swapData[66:]));
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
