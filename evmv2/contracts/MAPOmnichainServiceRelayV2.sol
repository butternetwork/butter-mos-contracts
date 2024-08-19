// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "./interface/IWrappedToken.sol";
import "./interface/IMintableToken.sol";
import "./interface/IVaultTokenV2.sol";
import "./interface/ITokenRegisterV3.sol";
import "./interface/IButterReceiver.sol";
import "./interface/IButterMosV2.sol";
import "./utils/EvmDecoder.sol";
import "./utils/NearDecoder.sol";

contract MAPOmnichainServiceRelayV2 is ReentrancyGuard, Initializable, Pausable, IButterMosV2, UUPSUpgradeable {
    using SafeMath for uint256;
    using Address for address;

    struct Rate {
        address receiver;
        uint256 rate;
    }

    enum chainType {
        NULL,
        EVM,
        NEAR
    }

    uint256 public immutable selfChainId = block.chainid;
    uint256 public nonce;
    address public wToken; // native wrapped token

    ITokenRegisterV3 public tokenRegister;
    ILightClientManager public lightClientManager;

    //id : 0 VToken  1:relayer
    mapping(uint256 => Rate) public distributeRate;
    mapping(bytes32 => bool) public orderList;
    mapping(uint256 => bytes) public mosContracts;
    mapping(uint256 => chainType) public chainTypes;
    address public butterRouter;

    event SetButterRouterAddress(address indexed _newRouter);

    event mapDepositIn(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        address indexed token,
        bytes32 orderId,
        bytes from,
        address to,
        uint256 amount
    );

    event mapTransferExecute(uint256 indexed fromChain, uint256 indexed toChain, address indexed from);
    event SetButterRouter(address _butterRouter);
    event SetTokenRegister(address tokenRegister);
    event SetLightClientManager(address lightClient);
    event RegisterChain(uint256 _chainId, bytes _address, chainType _type);
    event SetDistributeRate(uint256 _id, address _to, uint256 _rate);

    event mapSwapExecute(uint256 indexed fromChain, uint256 indexed toChain, address indexed from);

    event CollectFee(bytes32 indexed orderId, address indexed token, uint256 value);

    event CollectFeeV2(
        bytes32 indexed orderId,
        address indexed token,
        uint256 baseFee,
        uint256 bridgeFee,
        uint256 messageFee,
        uint256 vaultFee,
        uint256 protocolFee
    );

    function initialize(
        address _wToken,
        address _managerAddress,
        address _owner
    ) public initializer checkAddress(_wToken) checkAddress(_managerAddress) checkAddress(_owner) {
        wToken = _wToken;
        lightClientManager = ILightClientManager(_managerAddress);
        _changeAdmin(_owner);
    }

    receive() external payable {
        require(msg.sender == wToken, "only wToken");
    }

    modifier checkOrder(bytes32 orderId) {
        require(!orderList[orderId], "order exist");
        orderList[orderId] = true;
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _getAdmin(), "mosRelay :: only admin");
        _;
    }

    modifier checkAddress(address _address) {
        require(_address != address(0), "address is zero");
        _;
    }

    function setPause() external onlyOwner {
        _pause();
    }

    function setUnpause() external onlyOwner {
        _unpause();
    }

    function setTokenRegister(address _register) external onlyOwner checkAddress(_register) {
        tokenRegister = ITokenRegisterV3(_register);
        emit SetTokenRegister(_register);
    }

    function setButterRouter(address _butterRouter) external onlyOwner {
        butterRouter = _butterRouter;
        emit SetButterRouter(_butterRouter);
    }

    function setLightClientManager(address _managerAddress) external onlyOwner checkAddress(_managerAddress) {
        lightClientManager = ILightClientManager(_managerAddress);
        emit SetLightClientManager(_managerAddress);
    }

    function registerChain(uint256 _chainId, bytes memory _address, chainType _type) external onlyOwner {
        mosContracts[_chainId] = _address;
        chainTypes[_chainId] = _type;
        emit RegisterChain(_chainId, _address, _type);
    }

    // withdraw deposit token using vault token.
    function withdraw(address _vaultToken, uint256 _vaultAmount) external {
        require(_vaultToken != address(0), "vault token not registered");
        address token = IVaultTokenV2(_vaultToken).getTokenAddress();
        address vaultToken = tokenRegister.getVaultToken(token);
        require(_vaultToken == vaultToken, "Invalid vault token");

        uint256 amount = IVaultTokenV2(vaultToken).getTokenAmount(_vaultAmount);
        IVaultTokenV2(vaultToken).withdraw(selfChainId, _vaultAmount, msg.sender);
        _withdraw(token, payable(msg.sender), amount);
    }

    function setDistributeRate(uint256 _id, address _to, uint256 _rate) external onlyOwner checkAddress(_to) {
        require(_id < 3, "Invalid rate id");

        distributeRate[_id] = Rate(_to, _rate);

        require(
            (distributeRate[0].rate).add(distributeRate[1].rate).add(distributeRate[2].rate) <= 1000000,
            "invalid rate value"
        );
        emit SetDistributeRate(_id, _to, _rate);
    }

    // ------------------------------------------

    function swapOutToken(
        address _initiatorAddress,
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external override whenNotPaused returns (bytes32 orderId) {
        require(_toChain != selfChainId, "Cannot swap to self chain");
        require(_amount > 0, "Sending value is zero");
        require(IERC20(_token).balanceOf(msg.sender) >= _amount, "Insufficient token balance");
        SafeERC20.safeTransferFrom(IERC20(_token), msg.sender, address(this), _amount);
        orderId = _swapOut(_token, _to, _initiatorAddress, _amount, _toChain, _swapData);
    }

    function swapOutNative(
        address _initiatorAddress,
        bytes memory _to,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable override whenNotPaused returns (bytes32 orderId) {
        require(_toChain != selfChainId, "Cannot swap to self chain");
        uint256 amount = msg.value;
        require(amount > 0, "Sending value is zero");
        IWrappedToken(wToken).deposit{value: amount}();
        orderId = _swapOut(wToken, _to, _initiatorAddress, amount, _toChain, _swapData);
    }

    function depositToken(address _token, address _to, uint256 _amount) external override nonReentrant whenNotPaused {
        require(IERC20(_token).balanceOf(msg.sender) >= _amount, "balance too low");
        require(_amount > 0, "value too low");
        require(_token.isContract(), "token is not contract");
        SafeERC20.safeTransferFrom(IERC20(_token), msg.sender, address(this), _amount);

        _deposit(_token, Utils.toBytes(msg.sender), _to, _amount, bytes32(""), selfChainId);
    }

    function depositNative(address _to) external payable override nonReentrant whenNotPaused {
        uint256 amount = msg.value;
        require(amount > 0, "value too low");
        IWrappedToken(wToken).deposit{value: amount}();
        _deposit(wToken, Utils.toBytes(msg.sender), _to, amount, bytes32(""), selfChainId);
    }

    function swapIn(uint256 _chainId, bytes memory _receiptProof) external nonReentrant whenNotPaused {
        (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofData(
            _chainId,
            _receiptProof
        );
        require(success, message);
        if (chainTypes[_chainId] == chainType.NEAR) {
            (bytes memory mosContract, IEvent.swapOutEvent[] memory outEvents) = NearDecoder.decodeNearSwapLog(
                logArray
            );
            for (uint256 i = 0; i < outEvents.length; i++) {
                IEvent.swapOutEvent memory outEvent = outEvents[i];
                if (outEvent.toChain == 0) {
                    continue;
                }
                require(Utils.checkBytes(mosContract, mosContracts[_chainId]), "invalid mos contract");
                _swapIn(_chainId, outEvent);
            }
        } else if (chainTypes[_chainId] == chainType.EVM) {
            IEvent.txLog[] memory logs = EvmDecoder.decodeTxLogs(logArray);
            for (uint256 i = 0; i < logs.length; i++) {
                IEvent.txLog memory log = logs[i];
                bytes32 topic = abi.decode(log.topics[0], (bytes32));
                if (topic == EvmDecoder.MAP_SWAPOUT_TOPIC) {
                    (bytes memory mosContract, IEvent.swapOutEvent memory outEvent) = EvmDecoder.decodeSwapOutLog(log);
                    require(Utils.checkBytes(mosContract, mosContracts[_chainId]), "invalid mos contract");
                    if (Utils.checkBytes(mosContract, mosContracts[_chainId])) {
                        _swapIn(_chainId, outEvent);
                    }
                }
            }
        } else {
            require(false, "chain type error");
        }
        emit mapSwapExecute(_chainId, selfChainId, msg.sender);
    }

    function depositIn(uint256 _chainId, bytes memory _receiptProof) external payable nonReentrant whenNotPaused {
        (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofData(
            _chainId,
            _receiptProof
        );
        require(success, message);
        if (chainTypes[_chainId] == chainType.NEAR) {
            (bytes memory mosContract, IEvent.depositOutEvent[] memory depositEvents) = NearDecoder
                .decodeNearDepositLog(logArray);

            for (uint256 i = 0; i < depositEvents.length; i++) {
                IEvent.depositOutEvent memory depositEvent = depositEvents[i];
                if (depositEvent.toChain == 0) {
                    continue;
                }
                require(Utils.checkBytes(mosContract, mosContracts[_chainId]), "invalid mos contract");
                _depositIn(_chainId, depositEvent);
            }
        } else if (chainTypes[_chainId] == chainType.EVM) {
            IEvent.txLog[] memory logs = EvmDecoder.decodeTxLogs(logArray);
            for (uint256 i = 0; i < logs.length; i++) {
                if (abi.decode(logs[i].topics[0], (bytes32)) == EvmDecoder.MAP_DEPOSITOUT_TOPIC) {
                    (bytes memory mosContract, IEvent.depositOutEvent memory depositEvent) = EvmDecoder
                        .decodeDepositOutLog(logs[i]);
                    if (Utils.checkBytes(mosContract, mosContracts[_chainId])) {
                        _depositIn(_chainId, depositEvent);
                    }
                }
            }
        } else {
            require(false, "chain type error");
        }
        emit mapTransferExecute(_chainId, selfChainId, msg.sender);
    }

    function getBridgeTokenInfo(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toChainToken, uint8 decimals, bool mintable) {
        return tokenRegister.getTargetToken(_fromChain, _toChain, _fromToken);
    }

    function getBridgeFeeInfo(
        bytes memory _caller,
        bytes memory _fromToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance) {
        return tokenRegister.getBridgeFeeInfoV3(_caller, _fromToken, _fromChain, _fromAmount, _toChain, _withSwap);
    }

    function getSourceFeeByTarget(
        bytes memory _caller,
        bytes memory _targetToken,
        uint256 _targetChain,
        uint256 _targetAmount,
        uint256 _fromChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance, bytes memory fromChainToken) {
        return tokenRegister.getSourceFeeByTargetV3(_caller, _targetToken, _targetChain, _targetAmount, _fromChain, _withSwap);
    }

    function getFee(uint256 _id, uint256 _amount) public view returns (uint256, address) {
        Rate memory rate = distributeRate[_id];
        return (_amount.mul(rate.rate).div(1000000), rate.receiver);
    }

    function getOrderStatus(
        uint256 _chainId,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = orderList[_orderId];
        verifiable = lightClientManager.isVerifiable(_chainId, _blockNum, bytes32(""));
        nodeType = lightClientManager.nodeType(_chainId);
    }

    function _getOrderId(address _from, bytes memory _to, uint256 _toChain) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, selfChainId, _toChain, _from, _to));
    }

    function _collectFee(
        bytes memory _caller,
        bytes32 _orderId,
        address _token,
        uint256 _relayAmount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) internal returns (uint256 relayOutAmount, uint256 outAmount) {
        // address token = _token;
        // ITokenRegisterV3 register = ITokenRegisterV3(address(tokenRegister));
        address vaultToken = tokenRegister.getVaultToken(_token);
        require(vaultToken != address(0), "vault token not registered");

        uint256 proportionFee;
        uint256 excludeVaultFee = 0;
        uint256 totalFee;
        uint256 baseFee;

        (totalFee, baseFee, proportionFee) = tokenRegister.getTransferFeeV3(
            _caller,
            _token,
            _relayAmount,
            _fromChain,
            _toChain,
            _withSwap
        );
        if (_relayAmount >= totalFee) {
            relayOutAmount = _relayAmount - totalFee;
            outAmount = tokenRegister.getToChainAmount(_token, relayOutAmount, _toChain);
        } else if (_relayAmount >= baseFee) {
            proportionFee = _relayAmount - baseFee;
        } else {
            baseFee = _relayAmount;
            proportionFee = 0;
        }

        if (baseFee != 0) {
            address baseFeeReceiver = tokenRegister.getBaseFeeReceiver();
            _withdraw(_token, payable(baseFeeReceiver), baseFee);
            excludeVaultFee += baseFee;
        }

        if (proportionFee > 0) {
            excludeVaultFee += _collectBridgeFee(_orderId, _token, baseFee, proportionFee);
        }

        IVaultTokenV2(vaultToken).transferToken(
            _fromChain,
            _relayAmount,
            _toChain,
            relayOutAmount,
            selfChainId,
            excludeVaultFee
        );

        emit CollectFee(_orderId, _token, proportionFee);

        return (relayOutAmount, outAmount);
    }

    function _collectBridgeFee(
        bytes32 _orderId,
        address _token,
        uint256 baseFee,
        uint256 proportionFee
    ) internal returns (uint256 excludeVaultFee) {
        uint256 messageFee;
        uint256 protocolFee;
        address receiver;

        excludeVaultFee = 0;

        // messenger fee
        (messageFee, receiver) = getFee(1, proportionFee);
        if (messageFee != 0 && receiver != address(0)) {
            _withdraw(_token, payable(receiver), messageFee);

            excludeVaultFee += messageFee;
        }
        // protocol fee
        (protocolFee, receiver) = getFee(2, proportionFee);
        if (protocolFee != 0 && receiver != address(0)) {
            _withdraw(_token, payable(receiver), protocolFee);

            excludeVaultFee += protocolFee;
        }

        uint256 vaultFee = proportionFee - messageFee - protocolFee;

        emit CollectFeeV2(_orderId, _token, baseFee, proportionFee, messageFee, vaultFee, protocolFee);
    }

    function _swapIn(uint256 _chainId, IEvent.swapOutEvent memory _outEvent) internal checkOrder(_outEvent.orderId) {
        require(_chainId == _outEvent.fromChain, "invalid chain id");
        address token = tokenRegister.getRelayChainToken(_outEvent.fromChain, _outEvent.token);
        require(token != address(0), "map token not registered");
        uint256 mapOutAmount;
        uint256 outAmount;
        {
            uint256 mapAmount = tokenRegister.getRelayChainAmount(token, _outEvent.fromChain, _outEvent.amount);
            if (tokenRegister.checkMintable(token)) {
                IMintableToken(token).mint(address(this), mapAmount);
            }

            (mapOutAmount, outAmount) = _collectFee(
                _outEvent.from,
                _outEvent.orderId,
                token,
                mapAmount,
                _outEvent.fromChain,
                _outEvent.toChain,
                _outEvent.swapData.length != 0
            );
            // emit CollectFee(_outEvent.orderId, token, (mapAmount - mapOutAmount));
        }

        if (_outEvent.toChain == selfChainId) {
            address payable toAddress = payable(Utils.fromBytes(_outEvent.to));
            if (_outEvent.swapData.length > 0 && address(toAddress).isContract()) {
                SafeERC20.safeTransfer(IERC20(token), toAddress, mapOutAmount);
                try
                    IButterReceiver(toAddress).onReceived(
                        _outEvent.orderId,
                        token,
                        mapOutAmount,
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
                if (token == wToken) {
                    IWrappedToken(wToken).withdraw(mapOutAmount);
                    Address.sendValue(payable(toAddress), mapOutAmount);
                } else {
                    require(IERC20(token).balanceOf(address(this)) >= mapOutAmount, "balance too low");
                    SafeERC20.safeTransfer(IERC20(token), toAddress, mapOutAmount);
                }
            }
            emit mapSwapIn(
                _outEvent.fromChain,
                _outEvent.toChain,
                _outEvent.orderId,
                token,
                _outEvent.from,
                toAddress,
                mapOutAmount
            );
        } else {
            if (tokenRegister.checkMintable(token)) {
                IMintableToken(token).burn(mapOutAmount);
            }
            bytes memory toChainToken = tokenRegister.getToChainToken(token, _outEvent.toChain);
            require(!Utils.checkBytes(toChainToken, bytes("")), "out token not registered");

            _notifyLightClient(_outEvent.toChain, bytes(""));

            emit mapSwapOut(
                _outEvent.fromChain,
                _outEvent.toChain,
                _outEvent.orderId,
                toChainToken,
                _outEvent.from,
                _outEvent.to,
                outAmount,
                _outEvent.swapData
            );
        }
    }

    function _swapOut(
        address _token, // src token
        bytes memory _to,
        address _from,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) internal returns (bytes32 orderId) {
        bytes memory toToken = tokenRegister.getToChainToken(_token, _toChain);
        // bytes memory toToken = "0x0";
        require(!Utils.checkBytes(toToken, bytes("")), "Out token not registered");
        orderId = _getOrderId(_from, _to, _toChain);
        _from = (msg.sender == butterRouter) ? _from : msg.sender;
        (uint256 mapOutAmount, uint256 outAmount) = _collectFee(
            abi.encodePacked(_from),
            orderId,
            _token,
            _amount,
            selfChainId,
            _toChain,
            _swapData.length != 0
        );
        // emit CollectFee(orderId, _token, (_amount - mapOutAmount));

        if (tokenRegister.checkMintable(_token)) {
            IMintableToken(_token).burn(mapOutAmount);
        }
        _notifyLightClient(_toChain, bytes(""));
        emit mapSwapOut(selfChainId, _toChain, orderId, toToken, Utils.toBytes(_from), _to, outAmount, _swapData);
    }

    function _depositIn(
        uint256 _chainId,
        IEvent.depositOutEvent memory _depositEvent
    ) internal checkOrder(_depositEvent.orderId) {
        require(_chainId == _depositEvent.fromChain, "invalid chain id");
        require(selfChainId == _depositEvent.toChain, "invalid chain id");
        address token = tokenRegister.getRelayChainToken(_depositEvent.fromChain, _depositEvent.token);
        require(token != address(0), "map token not registered");

        uint256 mapAmount = tokenRegister.getRelayChainAmount(token, _depositEvent.fromChain, _depositEvent.amount);
        if (tokenRegister.checkMintable(token)) {
            IMintableToken(token).mint(address(this), mapAmount);
        }

        _deposit(
            token,
            _depositEvent.from,
            Utils.fromBytes(_depositEvent.to),
            mapAmount,
            _depositEvent.orderId,
            _depositEvent.fromChain
        );
    }

    function _deposit(
        address _token,
        bytes memory _from,
        address _to,
        uint256 _amount,
        bytes32 _orderId,
        uint256 _fromChain
    ) internal {
        address vaultToken = tokenRegister.getVaultToken(_token);
        require(vaultToken != address(0), "vault token not registered");

        IVaultTokenV2(vaultToken).deposit(_fromChain, _amount, _to);
        emit mapDepositIn(_fromChain, selfChainId, _token, _orderId, _from, _to, _amount);
    }

    function _withdraw(address _token, address payable _receiver, uint256 _amount) internal {
        if (_token == wToken) {
            IWrappedToken(wToken).withdraw(_amount);
            Address.sendValue(payable(_receiver), _amount);
        } else {
            SafeERC20.safeTransfer(IERC20(_token), _receiver, _amount);
        }
    }

    function _notifyLightClient(uint256 _chainId, bytes memory _data) internal {
        lightClientManager.notifyLightClient(_chainId, address(this), _data);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == _getAdmin(), "MAPOmnichainServiceRelay: only Admin can upgrade");
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
