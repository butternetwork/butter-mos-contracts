// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

//import "@openzeppelin/contracts/utils/Address.sol";
//import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

library Helper {
    address internal constant ZERO_ADDRESS = address(0);
    address internal constant NATIVE_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    error token_call_failed();

    function _isNative(address token) internal pure returns (bool) {
        return (token == ZERO_ADDRESS || token == NATIVE_ADDRESS);
    }

    function _checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        return keccak256(b1) == keccak256(b2);
    }

    function _toBytes(address _a) internal pure returns (bytes memory) {
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
        if (!_success || (_data.length != 0 && !abi.decode(_data, (bool)))) revert token_call_failed();
    }

    function _isContract(address _addr) internal view returns (bool) {
        return _addr.code.length != 0;
    }
}
