// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../interface/IButterBridgeV3.sol";
import "../interface/IMintableToken.sol";
import "../interface/IMapoExecutor.sol";
import "../interface/ISwapOutLimit.sol";
import "../interface/IButterReceiver.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

abstract contract BridgeAbstract is
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlEnumerableUpgradeable,
    IButterBridgeV3
{

    uint256 public constant version = 0;
    uint256 public immutable selfChainId = block.chainid;
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 private nonce;
    address public wToken;
    address public butterRouter;
    ISwapOutLimit public swapLimit;
    mapping(bytes32 => bool) public orderList;

    error order_exist();
    error invalid_order_Id();
    error in_amount_low();
    error token_call_failed();
    error token_not_registered();
    error zero_address();
    error not_contract();
    error zero_amount();
    error bridge_same_chain();
    error only_upgrade_role();
    event SetContract(uint256 _t, address _addr);
    event RegisterToken(address _token, uint256 _toChain, bool _enable, bool _mintAble);


    receive() external payable {}


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _wToken, address _defaultAdmin) public initializer {
        _checkAddress(_wToken);
        _checkAddress(_defaultAdmin);
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessControlEnumerable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(MANAGER_ROLE, _defaultAdmin);
        _grantRole(UPGRADER_ROLE, _defaultAdmin);
        wToken = _wToken;
    }

    function setContract(uint256 _t, address _addr) external onlyRole(MANAGER_ROLE){
        if(_addr == address(0)) revert zero_address();
        if(_t == 0) {
            wToken = _addr;
        } else if(_t == 1) {
            swapLimit = ISwapOutLimit(_addr);
        } else {
            butterRouter = _addr;
        }
        emit SetContract(_t, _addr);
    }

    function trigger() external onlyRole(MANAGER_ROLE) {
        paused() ? _unpause() : _pause();
    }

    function swapOutToken(
        address _sender, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable virtual override returns (bytes32 orderId) {}

    function depositToken(address _token, address to, uint256 _amount) external payable virtual returns (bytes32 orderId){}

    function bridgeIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external virtual override {}

    function _swapIn(
        bytes32 _orderId, 
        address _token, 
        address _to, 
        uint256 _amount, 
        uint256 _fromChain, 
        bytes memory _from, 
        bytes memory _swapData
    ) internal {
        address outToken = _token;
        if (_swapData.length > 0 && _isContract(_to)) {
            // if swap params is not empty, then we need to do swap on current chain
            _transferOut(_token, _to, _amount, false);
            try IButterReceiver(_to).onReceived(
                    _orderId,
                    _token,
                    _amount,
                    _fromChain,
                    _from,
                    _swapData
                ){} catch {}
        } else {
            // transfer token if swap did not happen
            _transferOut(_token, _to, _amount, true);
            if (_token == wToken) outToken = address(0);
        }
        emit SwapIn(_orderId, _fromChain, _token, _amount, _to, outToken, _from);
    }

    function _transferIn(address _token, address _from, uint256 _amount, bool _wrap) internal returns(address inToken){
        inToken = _token;
        if (_token == address(0)) {
            if(msg.value < _amount) revert in_amount_low();
            if(_wrap) { 
                _safeDeposit(wToken, _amount);
                inToken = wToken;
            }
        } else {
            _safeTransferFrom(_token, _from, address(this), _amount);
            _checkAndBurn(_token, _amount);
        }
    }

    function _transferOut(address _token, address _receiver, uint256 _amount,  bool _unwrap) internal {
        if (_token == wToken && _unwrap) {
            _safeWithdraw(wToken, _amount);
            _safeTransferNative(_receiver, _amount);
        } else {
            if(selfChainId == 728126428 && _token == 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C) {
                // Tron USDT
                _token.call(abi.encodeWithSelector(0xa9059cbb, _receiver, _amount));
            } else {
                _checkAndMint(_token, _amount);
                _safeTransfer(_token, _receiver, _amount);
            }
        }
    }

    function _getOrderId(address _from, bytes memory _to, uint256 _toChain) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, selfChainId, _toChain, _from, _to));
    }

    function _checkAddress(address _address) internal pure{
        if(_address == address(0)) revert zero_address();
    }

    function _checkAndBurn(address _token, uint256 _amount) internal {
        if (isMintAble(_token)) {
            IMintableToken(_token).burn(_amount);
        }
    }

    function _checkAndMint(address _token, uint256 _amount) internal {
        if (isMintAble(_token)) {
            IMintableToken(_token).mint(address(this), _amount);
        }
    }

    function isMintAble(address _token) internal view virtual returns(bool);

    function _checkLimit(uint256 amount, uint256 tochain, address token) internal {
        if (address(swapLimit) != address(0)) swapLimit.checkLimit(amount, tochain, token);
    }

    function _checkOrder(bytes32 _orderId) internal {
        if(orderList[_orderId]) revert order_exist();
        orderList[_orderId] = true;
    }

    function _getChainAndGasLimit(uint64 _fromChain, uint64 _toChain, uint64 _gasLimit) internal pure returns(uint256 chainAndGasLimit) {
        chainAndGasLimit = uint256(_fromChain) << 192 | uint256(_toChain) << 128 | uint256(_gasLimit);
    }

    // --------------------------------------------- utils ----------------------------------------------
    function _checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        return keccak256(b1) == keccak256(b2);
    }

    function  _toBytes(address _a) internal pure returns (bytes memory) {
        return abi.encodePacked(_a);
    }

    function _fromBytes(bytes memory bys) internal pure returns (address addr) {
        assembly {
            addr := mload(add(bys, 20))
        }
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        _checkCallResult(success, data);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        _checkCallResult(success, data);
    }

    function _safeTransferNative(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(bytes(""));
        _checkCallResult(success, bytes(""));
    }

    function _safeWithdraw(address _wToken, uint _value) internal {
        (bool success, bytes memory data) = _wToken.call(abi.encodeWithSelector(0x2e1a7d4d, _value));
        _checkCallResult(success, data);
    }

    function _safeDeposit(address _wToken, uint _value) internal {
        (bool success, bytes memory data) = _wToken.call{value: _value}(abi.encodeWithSelector(0xd0e30db0));
        _checkCallResult(success, data);
    }

    function _checkCallResult(bool _success, bytes memory _data) internal pure {
        if(!_success || (_data.length != 0 && !abi.decode(_data, (bool)))) revert token_call_failed();
    }

    function _isContract(address _addr) internal view returns(bool){
        return _addr.code.length != 0;
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        if(!hasRole(UPGRADER_ROLE, msg.sender)) revert only_upgrade_role();
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
