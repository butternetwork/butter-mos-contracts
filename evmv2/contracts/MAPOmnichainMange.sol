// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;


import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IMAPOmnichainMange.sol";


contract MAPOmnichainMange is AccessControlEnumerable,ReentrancyGuard,IMAPOmnichainMange{
    using Address for address;

    mapping(bytes32 => bool) public excuted;
    // tagrt => function => role;
    mapping(address => mapping(bytes4 => bytes32)) private controls;

    event AddToControl(address indexed target,bytes4 indexed funSig,bytes32 indexed role,address executor);
    event Execute(bytes32 indexed id,address indexed target,uint256 indexed value,address excutor,bytes playload);

    constructor(address default_admin){
        require(default_admin != address(0),"manage:address_0");
        _grantRole(DEFAULT_ADMIN_ROLE, default_admin);
    }

    function execute(ExecuteParam calldata param) external payable nonReentrant override{
        uint256 value = msg.value;
        require(value == param.value,"manage:value mismatching");
        _execute(param.id,param.target,value,param.playload);
    }

    function executeBatch(ExecuteParam[] calldata params) external payable nonReentrant override{
        uint256 len = params.length;
        uint256 totalValue;
        for(uint256 i = 0; i < len; i++){
            ExecuteParam memory param = params[i];
            totalValue += param.value;
            _execute(param.id,param.target,param.value,param.playload);
        }
        require(totalValue == msg.value,"manage:value mismatching");
    }

    function addToControl(address target,bytes4 funSig,bytes32 role) external override {
        require(target.isContract(),"manage:call to eoa address");
        bytes32 check = controls[address(this)][IMAPOmnichainMange.addToControl.selector];
        _checkRole(check);
        controls[target][funSig] = role;
        emit AddToControl(target,funSig,role,_msgSender());
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(DEFAULT_ADMIN_ROLE){
            _setRoleAdmin(role,adminRole);
    }

    function _execute(bytes32 id,address target, uint256 value, bytes memory playload) internal virtual {
        require(!excuted[id],"manage:excuted");
        require(playload.length != 0,"manage:empty playload");
        require(target.isContract(),"manage:call to eoa address");
        bytes4 funSig = _getFirst4Bytes(playload);
        bytes32 role = controls[target][funSig];
        _checkRole(role);
        excuted[id] = true;
        (bool success, ) = target.call{value: value}(playload);
        require(success, "manage:underlying transaction reverted");
        emit Execute(id,target,value,_msgSender(),playload);
    }

    function _getFirst4Bytes(bytes memory data) internal pure returns (bytes4 outBytes4) {
        if (data.length == 0) {
            return 0x0;
        }
        assembly {
            outBytes4 := mload(add(data, 32))
        }
    }
}