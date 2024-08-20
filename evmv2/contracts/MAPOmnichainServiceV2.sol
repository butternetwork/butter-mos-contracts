// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@mapprotocol/protocol/contracts/interface/ILightNode.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "./interface/IWrappedToken.sol";
import "./interface/IMintableToken.sol";
import "./interface/IButterReceiver.sol";
import "./interface/IButterMosV2.sol";
import "./utils/EvmDecoder.sol";

contract MAPOmnichainServiceV2 is ReentrancyGuard, Initializable, Pausable, IButterMosV2, UUPSUpgradeable {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;
    using Address for address;

    uint256 public immutable selfChainId = block.chainid;
    uint256 public nonce;
    address public wToken; // native wrapped token
    address public relayContract;
    uint256 public relayChainId;
    ILightNode public lightNode;

    enum chainType {
        NULL,
        EVM,
        NEAR
    }

    mapping(bytes32 => bool) public orderList;
    mapping(address => bool) public mintableTokens;
    mapping(uint256 => mapping(address => bool)) public tokenMappingList;
    address public butterRouter;

    // reserved
    IEvent.swapOutEvent[] private verifiedLogs;

    mapping(bytes32 => bool) public storedOrderId; // log hash

    event SetButterRouterAddress(address indexed _newRouter);

    event mapTransferExecute(uint256 indexed fromChain, uint256 indexed toChain, address indexed from);
    event SetButterRouter(address butterRouter);
    event SetLightClient(address lightNode);
    event SetWrappedToken(address wToken);
    event UpdateMintableToken(address token, bool mintable);

    event SetRelayContract(uint256 chainId, address relay);
    event RegisterToken(address token, uint256 toChain, bool enable);
    event RegisterChain(uint256 chainId, chainType _type);
    event mapSwapExecute(uint256 indexed fromChain, uint256 indexed toChain, address indexed from);
    event mapSwapInVerified(bytes logs);

    function initialize(
        address _wToken,
        address _lightNode,
        address _owner
    ) public initializer checkAddress(_wToken) checkAddress(_lightNode) checkAddress(_owner) {
        wToken = _wToken;
        emit SetWrappedToken(_wToken);
        lightNode = ILightNode(_lightNode);
        emit SetLightClient(_lightNode);
        _changeAdmin(_owner);
    }

    receive() external payable {}

    modifier checkOrder(bytes32 _orderId) {
        require(!orderList[_orderId], "order exist");
        orderList[_orderId] = true;
        _;
    }

    modifier checkBridgeable(address _token, uint256 _chainId) {
        require(tokenMappingList[_chainId][_token], "token not registered");
        _;
    }

    modifier checkAddress(address _address) {
        require(_address != address(0), "address is zero");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _getAdmin(), "mos :: only admin");
        _;
    }

    function setPause() external onlyOwner {
        _pause();
    }

    function setUnpause() external onlyOwner {
        _unpause();
    }

    function setLightClient(address _lightNode) external onlyOwner checkAddress(_lightNode) {
        lightNode = ILightNode(_lightNode);
        emit SetLightClient(_lightNode);
    }

    /*
    function setWrappedToken(address _wToken) external onlyOwner {
        wToken = _wToken;
        emit SetWrappedToken(_wToken);
    }
    */

    function setButterRouter(address _butterRouter) external onlyOwner {
        butterRouter = _butterRouter;
        emit SetButterRouter(_butterRouter);
    }

    function updateMintableToken(address[] memory _tokens, bool _mintable) external onlyOwner {
        for (uint256 i = 0; i < _tokens.length; i++) {
            mintableTokens[_tokens[i]] = _mintable;
            emit UpdateMintableToken(_tokens[i], _mintable);
        }
    }

    function setRelayContract(uint256 _chainId, address _relay) external onlyOwner checkAddress(_relay) {
        relayContract = _relay;
        relayChainId = _chainId;

        emit SetRelayContract(_chainId, _relay);
    }

    function registerTokenChains(address _token, uint256[] memory _toChains, bool _enable) external onlyOwner {
        require(_token.isContract(), "token is not contract");
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            tokenMappingList[toChain][_token] = _enable;
            emit RegisterToken(_token, toChain, _enable);
        }
    }

    /*
    function withdraw(address _token, address payable _receiver,uint256 _amount) external onlyOwner {
        _transfer(_token, _receiver, _amount);
    }
    */

    // ------------------------------------------

    function swapOutToken(
        address _initiator, // swap initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable virtual override nonReentrant whenNotPaused returns (bytes32 orderId) {
        require(_amount > 0, "Sending value is zero");
        address token = _token;
        if (token == address(0)) {
            token = wToken;
            require(msg.value >= _amount, "Invalid msg value");
            IWrappedToken(token).deposit{value: _amount}();
        } else {
            SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), _amount);
            if (isMintable(token)) {
                IMintableToken(token).burn(_amount);
            }
        }

        orderId = _swapOut(token, _to, _initiator, _amount, _toChain, _swapData);
    }

    /*
    function swapOutNative(
        address _initiatorAddress, // swap initiator address
        bytes memory _to,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    )
        external
        payable
        virtual
        override
        nonReentrant
        whenNotPaused
        checkBridgeable(wToken, _toChain)
        returns (bytes32 orderId)
    {
        uint256 amount = msg.value;
        require(amount > 0, "Sending value is zero");
        IWrappedToken(wToken).deposit{value: amount}();
        orderId = _swapOut(wToken, _to, _initiatorAddress, amount, _toChain, _swapData);
    }*/

    function depositToken(address _token, address _to, uint256 _amount) external payable override whenNotPaused {
        require(_amount > 0, "Sending value is zero");
        address from = msg.sender;
        address token = _token;
        if (token == address(0)) {
            token = wToken;
            require(msg.value >= _amount, "Invalid msg value");
            IWrappedToken(token).deposit{value: _amount}();
        } else {
            SafeERC20.safeTransferFrom(IERC20(token), from, address(this), _amount);
            if (isMintable(token)) {
                IMintableToken(token).burn(_amount);
            }
        }
        _deposit(token, from, _to, _amount, selfChainId, relayChainId);
    }

    /*
    function depositNative(
        address _to
    ) external payable override nonReentrant whenNotPaused checkBridgeable(wToken, relayChainId) {
        address from = msg.sender;
        uint256 amount = msg.value;
        require(amount > 0, "Sending value is zero");

        IWrappedToken(wToken).deposit{value: amount}();
        _deposit(wToken, from, _to, amount);
    }
    */

    function swapIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external nonReentrant whenNotPaused {
        require(!orderList[_orderId], "order exist");
        require(_chainId == relayChainId, "invalid chain id");
        (bool success, string memory message, bytes memory logArray) = lightNode.verifyProofDataWithCache(
            _receiptProof
        );
        require(success, message);
        _swapInVerifiedWithIndex(logArray, _logIndex);
        // emit mapSwapExecute(_chainId, selfChainId, msg.sender);
    }

    // verify swap in logs and store hash
    function swapInVerifyWithOrderId(uint256 _chainId, uint256 _logIndex,
        bytes32 _orderId, bytes memory _receiptProof) external nonReentrant whenNotPaused {
        require(!orderList[_orderId], "order exist");
        require(_chainId == relayChainId, "invalid chain id");
        (bool success, string memory message, bytes memory logArray) = lightNode.verifyProofDataWithCache(
            _receiptProof
        );
        require(success, message);
        bytes32 hash = keccak256(logArray);
        require(!storedOrderId[hash], "already verified");
        storedOrderId[hash] = true;
        emit mapSwapInVerified(logArray);
    }

    // execute stored swap in logs
    function swapInVerified(bytes calldata _logArray, uint256 _logIndex, bytes32 _orderId) external nonReentrant whenNotPaused {
        require(!orderList[_orderId], "order exist");
        bytes32 hash = keccak256(_logArray);
        require(storedOrderId[hash], "not verified");
        _swapInVerifiedWithIndex(_logArray, _logIndex);
    }

    function isMintable(address _token) public view returns (bool) {
        return mintableTokens[_token];
    }

    function isBridgeable(address _token, uint256 _toChain) public view returns (bool) {
        return tokenMappingList[_toChain][_token];
    }

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = orderList[_orderId];
        verifiable = lightNode.isVerifiable(_blockNum, bytes32(""));
        nodeType = lightNode.nodeType();
    }

    function _getOrderID(address _from, bytes memory _to, uint256 _fromChain, uint256 _toChain) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, _fromChain, _toChain, _from, _to));
    }

    function _swapInVerifiedWithIndex(bytes memory logArray, uint256 logIndex) private {
        IEvent.txLog memory log = EvmDecoder.decodeTxLog(logArray, logIndex);
        bytes32 topic = abi.decode(log.topics[0], (bytes32));

        require(relayContract == log.addr, "Invalid relay contract");
        require(topic == EvmDecoder.MAP_SWAPOUT_TOPIC, "Invalid relay topic");

        (, IEvent.swapOutEvent memory outEvent) = EvmDecoder.decodeSwapOutLog(log);
        // there might be more than one events to multi-chains
        // only process the event for this chain

        require(selfChainId == outEvent.toChain, "Invalid to chain id");
        _swapIn(outEvent);
    }

    function _swapIn(IEvent.swapOutEvent memory _outEvent) internal checkOrder(_outEvent.orderId) {
        address tokenIn = Utils.fromBytes(_outEvent.token);
        // receiving address
        address payable toAddress = payable(Utils.fromBytes(_outEvent.to));
        // amount of token need to be sent
        uint256 actualAmountIn = _outEvent.amount;

        if (isMintable(tokenIn)) {
            IMintableToken(tokenIn).mint(address(this), actualAmountIn);
        }

        // if swap params is not empty, then we need to do swap on current chain
        if (_outEvent.swapData.length > 0 && address(toAddress).isContract()) {
            _transfer(tokenIn, toAddress, actualAmountIn);
            try
                IButterReceiver(toAddress).onReceived(
                    _outEvent.orderId,
                    tokenIn,
                    actualAmountIn,
                    _outEvent.fromChain,
                    _outEvent.from,
                    _outEvent.swapData
                )
            {
                // do nothing
            } catch {
                // do nothing
            }
        } else {
            // transfer token if swap did not happen
            if (tokenIn == wToken) {
                IWrappedToken(tokenIn).withdraw(actualAmountIn);
                Address.sendValue(payable(toAddress), actualAmountIn);
            } else {
                _transfer(tokenIn, toAddress, actualAmountIn);
            }
        }
        emit mapSwapIn(
            _outEvent.fromChain,
            _outEvent.toChain,
            _outEvent.orderId,
            tokenIn,
            _outEvent.from,
            toAddress,
            actualAmountIn
        );
    }

    function _transfer(address _token, address _to, uint256 _amount) internal {
        if (_token == address(0)) {
            Address.sendValue(payable(_to), _amount);
        } else {
            if (selfChainId == 728126428 && _token == 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C) {
                // Tron USDT
                _token.call(abi.encodeWithSelector(0xa9059cbb, _to, _amount));
            } else {
                SafeERC20.safeTransfer(IERC20(_token), _to, _amount);
            }
        }
    }

    function _swapOut(
        address _token, // src token
        bytes memory _to,
        address _from,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) internal checkBridgeable(_token, _toChain) returns (bytes32 orderId) {
        uint256 fromChain = selfChainId;
        require(_toChain != fromChain, "Cannot swap to self chain");
        orderId = _getOrderID(msg.sender, _to, fromChain, _toChain);
        _from = (msg.sender == butterRouter) ? _from : msg.sender;
        _notifyLightClient(bytes(""));
        emit mapSwapOut(
            fromChain,
            _toChain,
            orderId,
            Utils.toBytes(_token),
            Utils.toBytes(_from),
            _to,
            _amount,
            _swapData
        );
    }

    function _deposit(address _token, address _from, address _to, uint256 _amount, uint256 _fromChain, uint256 _toChain) internal checkBridgeable(_token, _toChain) {
        bytes32 orderId = _getOrderID(_from, Utils.toBytes(_to), _fromChain, _toChain);
        _notifyLightClient(bytes(""));
        emit mapDepositOut(_fromChain, _toChain, orderId, _token, Utils.toBytes(_from), _to, _amount);
    }

    function _notifyLightClient(bytes memory _data) internal {
        lightNode.notifyLightClient(address(this), _data);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == _getAdmin(), "MAPOmnichainService: only Admin can upgrade");
    }

    function changeAdmin(address _admin) external onlyOwner checkAddress(_admin) {
        _changeAdmin(_admin);
    }

    function getAdmin() external view returns (address) {
        return _getAdmin();
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
