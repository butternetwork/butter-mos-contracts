// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

import {BaseImplementation} from "./base/BaseImplementation.sol";

import {IProtocolFee} from "../interface/IProtocolFee.sol";
import {IFlashSwap} from "../interface/IFlashSwap.sol";
import {IFeeTreasury} from "../interface/IFeeTreasury.sol";

contract ProtocolFee is BaseImplementation, IProtocolFee {
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    using EnumerableSet for EnumerableSet.AddressSet;

    address constant NATIVE_TOKEN = address(0x00);
    uint256 constant MAX_RATE_UNIT = 1_000_000;         // unit is 0.01 bps
    uint256 constant MAX_TOTAL_RATE = 100_000;           // 10%

    error invalid_token_balance(address, uint256);

    IFeeTreasury public feeTreasury;
    IFlashSwap public swap;

    struct FeeShare {
        uint64 share;
        address receiver;
    }

    uint256 public totalRate;

    uint256 public totalShare;
    mapping(FeeType => FeeShare) private feeShares;

    EnumerableSet.AddressSet private tokenList;

    // fee info from last share reset
    // mapping(address token => uint256) public totalClaimed;
    mapping(address token => mapping(FeeType => uint256)) public claimed;

    // accumulated fee info from start
    mapping(address token => mapping(FeeType => uint256)) public accumulated;

    event Set(address _swap, address _feeTreasury);

    event UpdateProtocolFee(uint256 feeRate);

    event UpdateToken(address indexed token, bool add);

    event UpdateReceiver(FeeType feeType, address receiver);
    event UpdateShare(FeeType feeType, uint256 share, uint256 totalShare);

    event CollectProtocolFee(address indexed token, uint256 amount);
    event ClaimFee(FeeType feeType, address token, uint256 amount);


    function initialize(address _defaultAdmin) public initializer {
        __BaseImplementation_init(_defaultAdmin);
    }

    receive() external payable {}


    function set(address _swap, address _feeTreasury) external restricted {
        require(_swap.code.length > 0 && _feeTreasury.code.length > 0);
        swap = IFlashSwap(_swap);
        feeTreasury = IFeeTreasury(_feeTreasury);
        emit Set(_swap, _feeTreasury);
    }

    // function updateProtocolFee(uint256 feeRate) external restricted {
    //     require(feeRate < MAX_TOTAL_RATE);
    //     totalRate = feeRate;

    //     emit UpdateProtocolFee(feeRate);
    // }

    function updateTokens(address[] memory tokens, bool added) external restricted {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (added) {
                tokenList.add(tokens[i]);
            } else {
                tokenList.remove(tokens[i]);
            }
            emit UpdateToken(tokens[i], added);
        }
    }

    function updateShares(FeeType[] memory types, uint64[] memory shares) external restricted {
        uint256 length = types.length;
        require (length > 0 && length == shares.length);

        _keepAccount();

        for (uint256 i = 0; i < length; i++) {
            FeeShare storage feeShare = feeShares[types[i]];
            totalShare = totalShare - feeShare.share + shares[i];
            feeShare.share = shares[i];

            emit UpdateShare(types[i], shares[i], totalShare);
        }
    }

    function updateReceivers(FeeType[] memory types, address[] memory receivers) external restricted {
        require (types.length == receivers.length);
        require (types.length > 0);

        uint256 length = types.length;
        for (uint256 i = 0; i < length; i++) {
            feeShares[types[i]].receiver = receivers[i];
            emit UpdateReceiver(types[i], receivers[i]);
        }
    }

    function getFeeShare(FeeType feeType) external view  returns(uint256) {
        return feeShares[feeType].share;
    }

    function getFeeReceiver(FeeType feeType) external view  returns(address) {
        return feeShares[feeType].receiver;
    }

    function getCumulativeFee(FeeType feeType, address token) external view override returns (uint256) {
        return (accumulated[token][feeType] + _getUnCumulativeFee(feeType, token));
    }

    function getClaimable(FeeType feeType, address token) external view override returns (uint256) {
        return _getClaimable(feeType, token);
    }

    function getProtocolFee(address, uint256 amount) external view override returns (uint256) {
        return (amount * totalRate / MAX_RATE_UNIT);
    }

    function claim(FeeType feeType, address[] memory tokens) external {
        uint256 len = tokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = tokens[i];
            _keepAccountSingleToken(token);
            uint256 claimable = accumulated[token][feeType] - claimed[token][feeType];
            if(claimable > 0) {
                // totalClaimed[token] += claimable;
                claimed[token][feeType] += claimable;
                _release(token, feeShares[feeType].receiver, claimable);
                emit ClaimFee(feeType, token, claimable);
            }
        }
    }

    function claimWithTargetToken(FeeType feeType, address[] memory tokens, address targetToken) external {
        uint256 len = tokens.length;
        uint256 totalAmount;
        for (uint256 i = 0; i < len; i++) {
            address token = tokens[i];
            _keepAccountSingleToken(token);
            uint256 claimable = accumulated[token][feeType] - claimed[token][feeType];
            if(claimable > 0) {
                // totalClaimed[token] += claimable;
                claimed[token][feeType] += claimable;
                if(token != targetToken) {
                    SafeERC20.forceApprove(IERC20(token), address(swap), claimable);
                    totalAmount += swap.swap(token, targetToken, claimable, 1, address(this));
                } else {
                    totalAmount += claimable;
                }
                emit ClaimFee(feeType, token, claimable);
            }
        }
        _release(targetToken, feeShares[feeType].receiver, totalAmount);
    }

    function _getClaimable(FeeType feeType, address token) internal view returns (uint256) {
        uint256 totalAccumulate = (accumulated[token][feeType] + _getUnCumulativeFee(feeType, token));
        return (totalAccumulate - claimed[token][feeType]);
    }

    // function _balance(address token) internal view returns (uint256) {
    //     if (token == NATIVE_TOKEN) {
    //         return address(this).balance;
    //     } else {
    //         return IERC20(token).balanceOf(address(this));
    //     }
    // }

    function _release(address token, address account, uint256 amount) internal {
        if (token == NATIVE_TOKEN) {
            Address.sendValue(payable(account), amount);
        } else {
            SafeERC20.safeTransfer(IERC20(token), account, amount);
        }
    }

    function _keepAccount() internal {
        uint256 length = tokenList.length();
        for (uint256 i = 0; i < length; i++) {
            address token = tokenList.at(i);
            _keepAccountSingleToken(token);
        }
    }

    function _keepAccountSingleToken(address token) internal {
        uint256 amount = feeTreasury.feeList(address(this), token);
        uint256 unAccount = _getUnAccount(token);
        if(amount > 0) feeTreasury.withdrawFee(address(this), token);
        uint256 total = amount + unAccount;
        if(total > 0){
            accumulated[token][FeeType.DEV] += _getShareAmount(FeeType.DEV, total);
            accumulated[token][FeeType.BUYBACK] += _getShareAmount(FeeType.BUYBACK, total);
            accumulated[token][FeeType.RESERVE] += _getShareAmount(FeeType.RESERVE, total);
            accumulated[token][FeeType.STAKER] += _getShareAmount(FeeType.STAKER, total);
        }
    }

    function _getUnCumulativeFee(FeeType feeType, address token) internal view returns(uint256) {
        uint256 amount = feeTreasury.feeList(address(this), token) + _getUnAccount(token);
        return _getShareAmount(feeType, amount);
    }

    function _getShareAmount(FeeType feeType, uint256 amount) internal view returns(uint256) {
       return amount * feeShares[feeType].share / totalShare;
    }

    function _getUnAccount(address token) internal view returns(uint256 unAccount) {
        uint256 account = accumulated[token][FeeType.DEV] - claimed[token][FeeType.DEV];
        account += accumulated[token][FeeType.BUYBACK] - claimed[token][FeeType.BUYBACK];
        account += accumulated[token][FeeType.RESERVE] - claimed[token][FeeType.RESERVE];
        account += accumulated[token][FeeType.STAKER] - claimed[token][FeeType.STAKER];
        unAccount = IERC20(token).balanceOf(address(this)) - account;
    }

}
