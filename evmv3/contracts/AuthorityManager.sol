// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/access/manager/AccessManager.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract AuthorityManager is AccessManager {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(uint64 role => EnumerableSet.AddressSet) private _roleMembers;

    constructor(address default_admin) AccessManager(default_admin) {}

    function getRoleMember(uint64 role, uint256 index) public view virtual returns (address) {
        return _roleMembers[role].at(index);
    }

    function getRoleMemberCount(uint64 role) public view virtual returns (uint256) {
        return _roleMembers[role].length();
    }

    function getRoleMembers(uint64 role) public view virtual returns (address[] memory) {
        return _roleMembers[role].values();
    }

    function grantRole(uint64 roleId, address account, uint32 executionDelay) public override onlyAuthorized {
        bool granted = _grantRole(roleId, account, getRoleGrantDelay(roleId), executionDelay);
        if (granted) {
            _roleMembers[roleId].add(account);
        }
    }

    function revokeRole(uint64 roleId, address account) public override onlyAuthorized {
        bool revoked = _revokeRole(roleId, account);
        if (revoked) {
            _roleMembers[roleId].remove(account);
        }
    }

    function renounceRole(uint64 roleId, address callerConfirmation) public override {
        if (callerConfirmation != _msgSender()) {
            revert AccessManagerBadConfirmation();
        }
        //_revokeRole(roleId, callerConfirmation);

        bool revoked = _revokeRole(roleId, callerConfirmation);
        if (revoked) {
            _roleMembers[roleId].remove(callerConfirmation);
        }
    }
}
