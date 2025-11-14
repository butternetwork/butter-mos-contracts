// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import {IDepositWhitelist} from "../interface/IDepositWhitelist.sol";
import {BaseImplementation} from "./base/BaseImplementation.sol";


contract DepositWhitelist is BaseImplementation, IDepositWhitelist { 

    bool public whitelistSwitch = true;

    mapping (address => uint256) private tokenLimit;

    mapping (address => bool) private whitelist;

    event UpdateTokenLimit(address[] tokens, uint256[] limits);
    event UpdateWhitelist(address[] users, bool flag);
    event SwitchToggle(bool _whitelistSwitch);

    function initialize(address _defaultAdmin) public initializer {
        __BaseImplementation_init(_defaultAdmin);
    }

    function switchToggle() external restricted {
        whitelistSwitch = !whitelistSwitch;
        emit SwitchToggle(whitelistSwitch);
    }

    function updateTokenLimit(address[] calldata tokens, uint256[] calldata limits) external restricted {
        uint256 len = tokens.length;
        require(len > 0 && tokens.length == limits.length);
        
        for(uint256 i = 0; i < len; i++) {
            tokenLimit[tokens[i]] = limits[i];
        }

        emit UpdateTokenLimit(tokens, limits);
    }

    function updateWhitelist(address[] calldata users, bool flag) external restricted {
        uint256 len = users.length;
        require(len > 0);
        for(uint256 i = 0; i < len; i++) {
            whitelist[users[i]] = flag;
        }
        emit UpdateWhitelist(users, flag);
    }

    function getTokenLimit(address token) external view returns(uint256) {
        return tokenLimit[token];
    }

    function inWhitelist(address user) external view returns(bool) {
        return whitelist[user];
    }

    function checkTokenAmountAndWhitelist(address token, address user, uint256 amount) external view override returns(bool) {
        if(whitelistSwitch) return whitelist[user] && (amount <= tokenLimit[token]);
        else return true;
    }
    
}