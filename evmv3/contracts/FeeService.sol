// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import {IFeeService} from "./interface/IFeeService.sol";
import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";

contract FeeService is AccessManaged, IFeeService {
    uint256 constant TOKEN_DECIMALS = 18;

    address public feeReceiver;
    mapping(uint256 => uint256) public baseGas; // chainid => gas
    mapping(uint256 => mapping(address => uint256)) public chainGasPrice; // chain => (feeToken => gasPrice)
    mapping(address => uint256) public tokenDecimals;

    event SetBaseGas(uint256 chainId, uint256 baseLimit);
    event SetChainGasPrice(address token, uint256 chainId, uint256 chainPrice);
    event SetFeeReceiver(address receiver);
    event SetTokenDecimals(address token, uint256 decimals);

    constructor(address _authority) AccessManaged(_authority) {}

    function setBaseGas(uint256 _chainId, uint256 _baseGas) external restricted {
        baseGas[_chainId] = _baseGas;
        emit SetBaseGas(_chainId, _baseGas);
    }

    function setChainGasPrice(uint256 _chainId, address _token, uint256 _chainPrice) external restricted {
        chainGasPrice[_chainId][_token] = _chainPrice;
        // tokenDecimals[_token] = 18;
        emit SetChainGasPrice(_token, _chainId, _chainPrice);
    }

    function setMultiBaseGas(uint256[] memory _chainList, uint256[] memory _baseList) external restricted {
        require(_chainList.length == _baseList.length, "FeeService: length mismatch");
        for (uint256 i = 0; i < _chainList.length; i++) {
            baseGas[_chainList[i]] = _baseList[i];
            emit SetBaseGas(_chainList[i], _baseList[i]);
        }
    }

    function setMultiChainGasPrice(
        address _token,
        uint256[] memory _chainList,
        uint256[] memory _priceList
    ) external restricted {
        require(_chainList.length == _priceList.length, "FeeService: length mismatch");
        for (uint256 i = 0; i < _chainList.length; i++) {
            chainGasPrice[_chainList[i]][_token] = _priceList[i];
            emit SetChainGasPrice(_token, _chainList[i], _priceList[i]);
        }
    }

    function setTokenDecimals(address _token, uint256 _decimal) external restricted {
        tokenDecimals[_token] = _decimal;
        emit SetTokenDecimals(_token, _decimal);
    }

    function setFeeReceiver(address _receiver) external restricted {
        feeReceiver = _receiver;
        emit SetFeeReceiver(_receiver);
    }

    function getFeeInfo(
        uint256 _chainId,
        address _feeToken
    ) external view override returns (uint256 _base, uint256 _gasPrice, address _receiverAddress) {
        return (baseGas[_chainId], chainGasPrice[_chainId][_feeToken], feeReceiver);
    }

    function getServiceMessageFee(
        uint256 _toChain,
        address _feeToken,
        uint256 _gasLimit
    ) external view override returns (uint256 amount, address receiverAddress) {
        require(baseGas[_toChain] > 0, "FeeService: not support target chain");
        receiverAddress = feeReceiver;
        uint256 decimals = (tokenDecimals[_feeToken] == 0) ? TOKEN_DECIMALS : tokenDecimals[_feeToken];

        uint256 tokenAmount = (baseGas[_toChain] + _gasLimit) * chainGasPrice[_toChain][_feeToken];
        if (decimals > TOKEN_DECIMALS) {
            amount = tokenAmount * (10 ** (decimals - TOKEN_DECIMALS));
        } else if (decimals < TOKEN_DECIMALS) {
            amount = tokenAmount / (10 ** (TOKEN_DECIMALS - decimals));
        } else {
            amount = tokenAmount;
        }
    }
}
