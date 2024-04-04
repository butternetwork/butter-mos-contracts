// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interface/IAuthority.sol";

contract Authority is AccessControlEnumerable, ReentrancyGuard, IAuthority {
    using Address for address;

    mapping(bytes32 => bool) public executed;
    // target => function => role;
    mapping(address => mapping(bytes4 => bytes32)) private controls;

    event AddControl(address indexed target, bytes4 indexed funSig, bytes32 indexed role, address executor);
    event Execute(bytes32 indexed id, address indexed target, address indexed executor, uint256 value, bytes payload);

    constructor(address default_admin) {
        require(default_admin != address(0), "manage: address_0");
        _grantRole(DEFAULT_ADMIN_ROLE, default_admin);
    }

    function isAuthorized(address user, address target, bytes4 funSig) external view override returns (bool) {
        bytes32 role = controls[target][funSig];
        return hasRole(role, user);
    }

    function execute(ExecuteParam calldata param) external payable override nonReentrant {
        uint256 value = msg.value;
        require(value == param.value, "auth: value mismatching");
        _execute(param.id, param.target, value, param.payload);
    }

    function executeBatch(ExecuteParam[] calldata params) external payable override nonReentrant {
        uint256 len = params.length;
        uint256 totalValue;
        for (uint256 i = 0; i < len; i++) {
            ExecuteParam memory param = params[i];
            totalValue += param.value;
            _execute(param.id, param.target, param.value, param.payload);
        }
        require(totalValue == msg.value, "auth: value mismatching");
    }

    function addControl(address target, bytes4 funSig, bytes32 role) external override {
        require(target.isContract(), "auth: not contract address");
        bytes32 setRole = controls[address(this)][IAuthority.addControl.selector];
        _checkRole(setRole);
        controls[target][funSig] = role;
        emit AddControl(target, funSig, role, _msgSender());
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }

    function _execute(bytes32 id, address target, uint256 value, bytes memory payload) internal virtual {
        require(!executed[id], "auth: executed");
        require(payload.length != 0, "auth: empty payload");
        require(target.isContract(), "auth: not contract address");
        bytes4 funSig = _getFirst4Bytes(payload);
        bytes32 role = controls[target][funSig];
        _checkRole(role);
        executed[id] = true;
        (bool success, ) = target.call{value: value}(payload);
        require(success, "auth: underlying transaction reverted");
        emit Execute(id, target, _msgSender(), value, payload);
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
