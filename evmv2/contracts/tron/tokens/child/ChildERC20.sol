// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IChildToken} from "./IChildToken.sol";

contract ChildERC20 is IChildToken, Initializable, ERC20Upgradeable, AccessControlUpgradeable, ERC20PermitUpgradeable, UUPSUpgradeable {
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");

    enum Status {
        NONEXISTENT,
        NONRELAY,
        RELAYED,
        ERROR
    }
    struct  MapSwapOut{
        uint256  fromChain;
        uint256  toChain;
        bytes32 orderId;
        bytes token;
        bytes from;
        bytes to;
        uint256 amount;
        bytes swapData ;
    }
    mapping (bytes32 => Status) public deposits;
    event ReceiveFormRootChain(address user,bytes depositData);
    event mapSwapOut(
            uint256 indexed fromChain, // from chain
            uint256 indexed toChain, // to chain
            bytes32 orderId, // order id
            bytes token, // token to transfer
            bytes from, // source chain from address
            bytes to,
            uint256 amount,
            bytes swapData // swap data, used on target chain dex.
    ); 

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner,string calldata name_,string calldata symbol_,address childChainManager_) initializer public {
        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        __ERC20Permit_init(name_);
        __UUPSUpgradeable_init();
        _setupRole(DEPOSITOR_ROLE, childChainManager_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner);
        _grantRole(UPGRADER_ROLE, owner);
    }

       /**
     * @notice called when token is deposited on root chain
     * @dev Should be callable only by ChildChainManager
     * Should handle deposit by minting the required amount for user
     * Make sure minting is done only by this function
     * @param user user address for whom deposit is being done
     * @param depositData abi encoded amount
     */
    function deposit(address user, bytes calldata depositData)
        external
        override
        onlyRole(DEPOSITOR_ROLE)
    {
        uint256 amount = abi.decode(depositData, (uint256));
        _mint(user, amount);
        deposits[keccak256(depositData)] = Status.NONRELAY;
        emit ReceiveFormRootChain(user,depositData);
    }

       /**
     * @notice called when user wants to withdraw tokens back to root chain
     * @dev Should burn user's tokens. This transaction will be verified when exiting on root chain
     * @param amount amount of tokens to withdraw
     */
    function withdrawTo(address to, uint256 amount) public {
        _burn(_msgSender(), amount);
        emit WithdrawTo(to, address(0x00), amount);
    }

    function withdraw(uint256 amount) external {
        withdrawTo(_msgSender(), amount);
    }


    function relay(bytes calldata depositData) external {
        bytes32 hash = keccak256(depositData);
        require(deposits[hash] == Status.NONRELAY,"already relay or nonexistent");
        deposits[hash] = Status.RELAYED;
        bytes memory eventBytes = depositData[32:];
        MapSwapOut memory m;
        (m.fromChain,m.toChain,m.orderId,m.token,m.from,m.to,m.amount,m.swapData) =
        abi.decode(eventBytes,(uint256,uint256,bytes32,bytes,bytes,bytes,uint256,bytes));
        emit mapSwapOut(m.fromChain,m.toChain,m.orderId,m.token,m.from,m.to,m.amount,m.swapData);
  }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}
}