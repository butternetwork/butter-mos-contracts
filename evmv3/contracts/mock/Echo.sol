// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interface/IMapoExecutor.sol";
import "../interface/IRelayExecutor.sol";
import "../interface/IMOSV3.sol";
import "hardhat/console.sol";

contract Echo is Ownable, IMapoExecutor, IRelayExecutor {
    address omniService;

    mapping(string => string) public EchoList;

    mapping(uint256 => address) public TargetList;

    mapping(address => bool) public WhiteList;

    error on_permission();

    constructor() Ownable(msg.sender) {}

    function setList(string memory _key, string memory _val) external returns (bool) {
        require(WhiteList[msg.sender], " have no right ");
        EchoList[_key] = _val;
        return true;
    }

    function setRelayList(string memory _key, string memory _val) external returns (bytes memory newData) {
        require(WhiteList[msg.sender], " have no right ");
        EchoList[_key] = _val;
        string memory key = "hello";
        string memory val = "hellCallData";

        IMOSV3.MessageData memory msgData = IMOSV3.MessageData({
            relay: true,
            msgType: IMOSV3.MessageType.MESSAGE,
            target: bytes(""),
            payload: abi.encode(key, val),
            gasLimit: 500000,
            value: 0
        });

        newData = abi.encode(msgData);

        return newData;
    }

    function getData(string memory _key, string memory _val) public pure returns (bytes memory data) {
        data = abi.encodeWithSelector(Echo.setList.selector, _key, _val);
    }

    function getMessageDatas(bytes memory _b) public pure returns (bytes memory _data) {
        IMOSV3.MessageData memory msgData = abi.decode(_b, (IMOSV3.MessageData));
        _data = msgData.payload;
        //return _data;
    }

    function getRelayData(string memory _key, string memory _val) public pure returns (bytes memory data) {
        data = abi.encodeWithSelector(Echo.setRelayList.selector, _key, _val);
    }

    function getMessageData(string memory _key, string memory _val) public pure returns (bytes memory data) {
        data = abi.encode(_key, _val);
    }

    function getMessageBytes(IMOSV3.MessageData memory mData) public pure returns (bytes memory data) {
        data = abi.encode(mData);
    }

    function setWhiteList(address _executeAddress) external onlyOwner {
        WhiteList[_executeAddress] = true;
    }

    function setMapoService(address _IOmniService) external onlyOwner {
        omniService = _IOmniService;
    }

    function setTarget(address _target, uint256 _chainId) external onlyOwner {
        TargetList[_chainId] = _target;
    }

    function echo(
        uint256 _tochainId,
        bytes memory _target,
        string memory _key,
        string memory _val
    ) external payable returns (bytes memory newData) {
        bytes memory data = getMessageData(_key, _val);

        bytes memory mData = abi.encode(false, IMOSV3.MessageType.MESSAGE, _target, data, 500000, 0);

        IMOSV3(omniService).transferOut{value: msg.value}(_tochainId, mData, address(0));

        newData = mData;
    }

    function mapoExecute(
        uint256,
        uint256,
        bytes calldata,
        bytes32,
        bytes calldata _message
    ) external payable override returns (bytes memory newData) {
        //if (!IMOSV3(omniService).getExecutePermission(address(this), _fromChain, _fromAddress)) revert on_permission();
        require(WhiteList[msg.sender], "on_permission");

        (string memory key, string memory value) = abi.decode(_message, (string, string));

        EchoList[key] = value;

        string memory val = "relay echo";
        IMOSV3.MessageData memory msgData = IMOSV3.MessageData({
            relay: true,
            msgType: IMOSV3.MessageType.MESSAGE,
            target: bytes(""),
            payload: abi.encode(val, key),
            gasLimit: 500000,
            value: 0
        });

        newData = abi.encode(msgData);

        return newData;
    }

    function relayExecute(
        uint256,
        uint256,
        bytes32,
        address _token,
        uint256 _amount,
        address,
        bytes calldata _fromAddress,
        bytes calldata _message,
        bytes calldata
    ) external payable override returns (address token, uint256 amount, bytes memory target, bytes memory newMessage) {
        // require(WhiteList[msg.sender],"on_permission");

        (string memory key, string memory value) = abi.decode(_message, (string, string));

        EchoList[key] = value;

        string memory val = "relay execute";
        //        IMOSV3.MessageData memory msgData = IMOSV3.MessageData({
        //            relay: true,
        //            msgType: IMOSV3.MessageType.MESSAGE,
        //            target: bytes(""),
        //            payload: abi.encode(val, key),
        //            gasLimit: 500000,
        //            value: 0
        //        });

        newMessage = abi.encode(key, val);

        return (_token, _amount, _fromAddress, newMessage);
    }
}
