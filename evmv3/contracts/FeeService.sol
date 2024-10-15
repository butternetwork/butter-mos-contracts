// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./interface/IFeeService.sol";

contract FeeService is Ownable2StepUpgradeable, IFeeService {
    address public feeReceiver;
    mapping(uint256 => uint256) public baseGas; // chainid => gas
    mapping(uint256 => mapping(address => uint256)) public chainGasPrice; // chain => (feeToken => gasPrice)
    mapping(address => uint256) public tokenDecimals;

    event SetBaseGas(uint256 chainId, uint256 basLimit);
    event SetChainGasPrice(uint256 chainId, uint256 chainPrice);
    event SetFeeReceiver(address receiver);
    event SetTokenDecimals(address token,uint256 decimal);

    constructor() {}

    function initialize() public initializer {
        __Ownable2Step_init();
    }

    function getFeeInfo(
        uint256 _chainId,
        address _feeToken
    ) external view override returns (uint256 _base, uint256 _gasPrice, address _receiverAddress) {
        return (baseGas[_chainId], chainGasPrice[_chainId][_feeToken], feeReceiver);
    }

    function setBaseGas(uint256 _chainId, uint256 _baseLimit) external onlyOwner {
        baseGas[_chainId] = _baseLimit;
        emit SetBaseGas(_chainId, _baseLimit);
    }

    function setChainGasPrice(uint256 _chainId, address _token, uint256 _chainPrice) external onlyOwner {
        chainGasPrice[_chainId][_token] = _chainPrice;
        tokenDecimals[_token] = 18;
        emit SetChainGasPrice(_chainId, _chainPrice);
    }

    function setTokenDecimals(address _token,uint256 _decimal) external onlyOwner{
        tokenDecimals[_token] = _decimal;
        emit SetTokenDecimals(_token,_decimal);
    }

    function setFeeReceiver(address _receiver) external onlyOwner {
        feeReceiver = _receiver;
        emit SetFeeReceiver(_receiver);
    }

    function getServiceMessageFee(
        uint256 _toChain,
        address _feeToken,
        uint256 _gasLimit
    ) external view override returns (uint256 amount, address receiverAddress){
        require(baseGas[_toChain] > 0, "FeeService: not support target chain");
        receiverAddress = feeReceiver;
        if(tokenDecimals[_feeToken] >= 18 || tokenDecimals[_feeToken] == 0){
            amount = (baseGas[_toChain] + _gasLimit) * chainGasPrice[_toChain][_feeToken];
        }else {
            amount = ((baseGas[_toChain] + _gasLimit) * chainGasPrice[_toChain][_feeToken]) / 10 ** (18 - tokenDecimals[_feeToken]);
        }

    }
}
