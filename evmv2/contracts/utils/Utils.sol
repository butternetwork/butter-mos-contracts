// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "./ButterLib.sol";

library Utils {
    function assembleButterCoreParam(
        address _tokenIn,
        uint _actualAmountIn,
        uint _predicatedAmountIn,
        bytes memory _to,
        ButterLib.SwapData memory _swapData
    )
    internal
    view
    returns (ButterLib.ButterCoreSwapParam memory) {
        ButterLib.SwapParam[] memory swapParams = _swapData.swapParams;
        uint[] memory amountInArr;
        bytes[] memory paramsArr;
        uint32[] memory routerIndex;


        // modify swapParam amount in, compensate the difference between actual and predicted amount.
        if (_actualAmountIn >= _predicatedAmountIn) {
            swapParams[0].amountIn += (_actualAmountIn - _predicatedAmountIn);
        }

        for (uint i = 0; i < swapParams.length; i++) {

            amountInArr[i] = swapParams[i].amountIn;

            routerIndex[i] = uint32(swapParams[i].routerIndex);

            paramsArr[i] = abi.encode(
                amountInArr[i],
                swapParams[i].minAmountOut,
                swapParams[i].path,
                _to,
                block.timestamp + 1000,
                _tokenIn,
                Utils.fromBytes(_swapData.targetToken)
            );
        }

        ButterLib.ButterCoreSwapParam memory params = ButterLib.ButterCoreSwapParam({
            amountInArr : amountInArr,
            paramsArr : paramsArr,
            routerIndex : routerIndex,
            inputOutAddre : [_tokenIn, Utils.fromBytes(_swapData.targetToken)]
        });

        return params;

    }

    function getAmountInSumFromSwapParams(ButterLib.SwapParam[] memory swapParams)
    internal
    pure
    returns (uint sum_)
    {
        sum_ = 0;
        for (uint i = 0; i < swapParams.length; i++) {
            sum_ += swapParams[i].amountIn;
        }
    }

    function checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool){
        return keccak256(b1) == keccak256(b2);
    }

    function fromBytes(bytes memory bys) internal pure returns (address addr){
        assembly {
            addr := mload(add(bys, 20))
        }
    }


    function toBytes(address self) internal pure returns (bytes memory b) {
        b = abi.encodePacked(self);
    }

    function splitExtra(bytes memory extra)
    internal
    pure
    returns (bytes memory newExtra){
        require(extra.length >= 64, "Invalid extra result type");
        newExtra = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            newExtra[i] = extra[i];
        }
    }


    function hexStrToBytes(bytes memory _hexStr)
    internal
    pure
    returns (bytes memory)
    {
        //Check hex string is valid
        if (
            _hexStr.length % 2 != 0 ||
            _hexStr.length < 4
        ) {
            revert("hexStrToBytes: invalid input");
        }

        bytes memory bytes_array = new bytes(_hexStr.length / 2 - 32);

        for (uint256 i = 64; i < _hexStr.length; i += 2) {
            uint8 tetrad1 = 16;
            uint8 tetrad2 = 16;

            //left digit
            if (
                uint8(_hexStr[i]) >= 48 && uint8(_hexStr[i]) <= 57
            ) tetrad1 = uint8(_hexStr[i]) - 48;

            //right digit
            if (
                uint8(_hexStr[i + 1]) >= 48 &&
                uint8(_hexStr[i + 1]) <= 57
            ) tetrad2 = uint8(_hexStr[i + 1]) - 48;

            //left A->F
            if (
                uint8(_hexStr[i]) >= 65 && uint8(_hexStr[i]) <= 70
            ) tetrad1 = uint8(_hexStr[i]) - 65 + 10;

            //right A->F
            if (
                uint8(_hexStr[i + 1]) >= 65 &&
                uint8(_hexStr[i + 1]) <= 70
            ) tetrad2 = uint8(_hexStr[i + 1]) - 65 + 10;

            //left a->f
            if (
                uint8(_hexStr[i]) >= 97 &&
                uint8(_hexStr[i]) <= 102
            ) tetrad1 = uint8(_hexStr[i]) - 97 + 10;

            //right a->f
            if (
                uint8(_hexStr[i + 1]) >= 97 &&
                uint8(_hexStr[i + 1]) <= 102
            ) tetrad2 = uint8(_hexStr[i + 1]) - 97 + 10;

            //Check all symbols are allowed
            if (tetrad1 == 16 || tetrad2 == 16)
                revert("hexStrToBytes: invalid input");

            bytes_array[i / 2 - 32] = bytes1(16 * tetrad1 + tetrad2);


        }

        return bytes_array;
    }


}