// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;


import "../interface/IRootChainManager.sol";
import "../MAPOmnichainServiceV2.sol";


contract MAPOmnichainServiceTron is MAPOmnichainServiceV2 {
    IERC20 public rootToken; 

    IRootChainManager public rootChainManager;

    event SetRootChainManager(IRootChainManager _rootChainManager);

    event SetRootToken(IERC20 _rootToken);

    function setRootChainManager(IRootChainManager _rootChainManager) external onlyOwner {
        rootChainManager = _rootChainManager;
        emit SetRootChainManager(_rootChainManager);
    }

    function setRootToken(IERC20 _rootToken)external onlyOwner {
        rootToken = _rootToken;
        emit SetRootToken(_rootToken);
    }

    function giveAllowance(address _token,address _spender,uint256 _amount)external onlyOwner {
         IERC20(_token).approve(_spender,_amount);
    }

     function swapOutToken(
        address _initiatorAddress, // swap initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    )
    external
    override
    nonReentrant
    whenNotPaused
    checkBridgeable(_token, _toChain)
    returns(bytes32 orderId)
    {
        require(_toChain != selfChainId, "self chain");
        require(_amount > 0, "value is zero");

        if (isMintable(_token)) {
            IMintableToken(_token).burnFrom(msg.sender, _amount);
        } else {
            SafeERC20.safeTransferFrom(IERC20(_token), msg.sender, address(this), _amount);
        }
 
        orderId = _getOrderID(msg.sender, _to, _toChain); 
        
        {
            bytes memory mosData = abi.encode(selfChainId, _toChain, orderId, Utils.toBytes(_token), Utils.toBytes(_initiatorAddress), _to, _amount, _swapData);

            uint256 depositAmount = 1000000000000000000;

            payFee(_initiatorAddress);

            rootChainManager.depositFor(_initiatorAddress, address(rootToken), abi.encodePacked(depositAmount, mosData));
        }

        emit mapSwapOut(
            selfChainId,
            _toChain,
            orderId,
            Utils.toBytes(_token),
            Utils.toBytes(_initiatorAddress),
            _to,
            _amount,
            _swapData
        );
    }

    function swapOutNative(
        address _initiatorAddress, // swap initiator address
        bytes memory _to,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    )
    external
    override
    payable
    nonReentrant
    whenNotPaused
    checkBridgeable(wToken, _toChain)
    returns(bytes32 orderId)
    {
        require(_toChain != selfChainId, "self chain");
        uint amount = msg.value;
        require(amount > 0, "value is zero");
        IWrappedToken(wToken).deposit{value : amount}();
        orderId = _getOrderID(msg.sender, _to, _toChain);

        {
            bytes memory datas = abi.encode(selfChainId,_toChain,orderId,Utils.toBytes(wToken),Utils.toBytes(_initiatorAddress),_to,amount,_swapData);
            uint256 depositAmount = 1;
            //rootToken.approve(predicate,depositAmount);
            payFee(_initiatorAddress);
            rootChainManager.depositFor(_initiatorAddress,address(rootToken),abi.encodePacked(depositAmount,datas));
        }
        emit mapSwapOut(
            selfChainId,
            _toChain,
            orderId,
            Utils.toBytes(wToken),
            Utils.toBytes(_initiatorAddress),
            _to,
            amount,
            _swapData
        );

    }

    function payFee(address _payer) private {
       address feeToken =  rootChainManager.feeToken();

       uint256 feeAmount = rootChainManager.feeAmount();

       if(address(feeToken) != address(0x0) && (feeAmount > 0)){
          SafeERC20.safeTransferFrom(IERC20(feeToken),_payer,address(this),feeAmount);
          IERC20(feeToken).approve(address(rootChainManager), feeAmount);
       }
    }
}
