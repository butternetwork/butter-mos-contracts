// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import {IDepositWhitelist} from "../interface/IDepositWhitelist.sol";
import {BaseImplementation} from "./base/BaseImplementation.sol";


contract DepositWhitelist is BaseImplementation, IDepositWhitelist { 

    bool public whitelistSwitch = true;

    mapping (address => uint256) private tokenLimit;

    mapping (address => bool) private whitelist;

    address public relay;
    
    // user -> token - depositAmount;
    mapping (address => mapping (address => uint256)) public userTokenTotalDeposit;


    error only_relay();
    event UpdateTokenLimit(address[] tokens, uint256[] limits);
    event UpdateWhitelist(address[] users, bool flag);
    event SwitchToggle(bool _whitelistSwitch);
    event SetRelayAddress(address _relay);
    function initialize(address _defaultAdmin) public initializer {
        __BaseImplementation_init(_defaultAdmin);
    }

    function switchToggle() external restricted {
        whitelistSwitch = !whitelistSwitch;
        emit SwitchToggle(whitelistSwitch);
    }

    function setRelayAddress(address _relay) external restricted {
        require(_relay != address(0));
        relay = _relay;
        emit SetRelayAddress(_relay);
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

    function checkTokenAmountAndWhitelist(address token, address user, uint256 amount) external override returns(bool) {
        if(msg.sender != relay) revert only_relay();
        if(whitelistSwitch) {
            if(whitelist[user] && (userTokenTotalDeposit[user][token] + amount) <= tokenLimit[token]) {
                userTokenTotalDeposit[user][token] += amount;
                return true;
            }
            return false;
        }
        return true;
    }
    
}