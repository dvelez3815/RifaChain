// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * @title RifaChain
 * @author dvelez3815
 * @notice Protocol for decentralized raffles supporting multi-chain deployment, native/ERC-20 payments, and direct payouts.
 * @dev Integrated with Chainlink VRF v2.5 for provably fair winner selection.
 * @custom:repo https://github.com/dvelez3815/RifaChain
 */
contract RifaChain is ReentrancyGuard, VRFConsumerBaseV2Plus {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Versioning
    // Versioning
    // Versioning
    uint256 public constant VERSION = 1;
    uint256 public gracePeriod = 5 minutes;

    // --- Structs ---

    /**
     * @notice Defines the type of token used for raffle payments.
     * @param NATIVE Native blockchain currency (e.g., ETH, MATIC, BNB).
     * @param ERC20 ERC-20 standard token (e.g., USDT, USDC).
     */
    enum TokenType { NATIVE, ERC20 }

    /**
     * @notice Represents a Raffle and its configuration.
     * @param id Unique identifier for the raffle.
     * @param creator Wallet address of the raffle organizer.
     * @param title Title of the raffle.
     * @param description Detailed description of the raffle.
     * @param startTime Timestamp when the raffle opens for entries.
     * @param endTime Timestamp when the raffle closes.
     * @param minParticipants Minimum number of tickets required for the raffle to be valid.
     * @param maxParticipants Maximum number of tickets allowed (0 for unlimited).
     * @param isPublic If true, listed on the explore page. If false, requires a signature to join.
     * @param tokenType The type of asset used for ticket purchase (NATIVE or ERC20).
     * @param tokenAddress The contract address of the ERC20 token (address(0) for NATIVE).
     * @param ticketPrice Cost per ticket in wei.
     * @param payoutAddress Address where creator earnings (ticket revenue) will be sent.
     * @param isActive True if the raffle is currently running.
     * @param winnersSelected True if the draw has completed and winners are picked.
     * @param requestId The Chainlink VRF request ID associated with the draw.
     * @param allowMultipleEntries If true, a single wallet can buy multiple tickets.
     * @param fundingAmount The initial prize pool deposited by the creator.
     * @param prizePool The current distributable prize pool (usually equals fundingAmount).
     * @param ticketRevenue Total revenue generated from ticket sales (separate from prize pool).
     * @param winnerPercentages Array of percentages for prize distribution (must sum to 100).
     * @param isCancelled True if the raffle was cancelled.
     * @param earningsCollected True if the creator has withdrawn their ticket revenue.
     */
    struct Raffle {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 startTime;
        uint256 endTime;
        uint256 minParticipants;
        uint256 maxParticipants;
        bool isPublic;
        TokenType tokenType;
        address tokenAddress;
        uint256 ticketPrice;
        address payoutAddress;
        bool isActive;
        bool winnersSelected;
        uint256 requestId;
        bool allowMultipleEntries;
        uint256 fundingAmount;
        uint256 prizePool;
        uint256 ticketRevenue;

        uint256[] winnerPercentages;
        bool isCancelled;
        bool earningsCollected;
    }

    // --- State Variables ---

    /// @notice Total number of raffles created.
    uint256 public raffleCount;
    
    /// @notice Mapping from Raffle ID to Raffle struct.
    mapping(uint256 => Raffle) public raffles;
    
    /// @notice Mapping from Raffle ID to list of participant addresses.
    mapping(uint256 => address[]) public participants;
    
    /// @notice Mapping from Raffle ID to User Address to Ticket Count.
    mapping(uint256 => mapping(address => uint256)) public ticketCounts; // Track tickets per user per raffle

    // Chainlink VRF Variables
    /// @notice Chainlink VRF Subscription ID.
    uint256 s_subscriptionId;
    /// @notice Chainlink VRF Key Hash (Gas Lane).
    bytes32 keyHash;
    /// @notice Gas limit for the fulfillment callback.
    uint32 callbackGasLimit = 600000; // Increased for multiple winners
    /// @notice Number of confirmations required for VRF request.
    uint16 requestConfirmations = 3;
    /// @notice Number of random words requested (dynamic based on winners).
    uint32 numWords = 1; 

    /// @notice Mapping from VRF Request ID to Raffle ID.
    mapping(uint256 => uint256) public requestIdToRaffleId;
    /// @notice Mapping from Raffle ID to list of Winner addresses.
    mapping(uint256 => address[]) public raffleWinners; 
    /// @notice Mapping from User Address to list of Raffle IDs won.
    mapping(address => uint256[]) public userWinnings; 
    /// @notice Mapping from Raffle ID to Winner Address to Pending Prize Amount.
    mapping(uint256 => mapping(address => uint256)) public pendingWinnings; 

    // Fee Variables
    /// @notice Base fee for creating a raffle with 1 winner.
    uint256 public baseCreationFee = 0.005 ether; 
    /// @notice Additional fee per extra winner slot.
    uint256 public additionalWinnerFee = 0.0025 ether; 
    /// @notice Platform fee percentage in basis points (e.g., 800 = 8%).
    uint256 public platformFeeBasisPoints = 800; 
    /// @notice Address that receives platform fees.
    address public feeRecipient;

    // --- Events ---

    /**
     * @notice Emitted when a new raffle is created.
     * @param raffleId The unique ID of the created raffle.
     * @param creator The address of the raffle creator.
     * @param tokenType The type of token used for tickets (0=NATIVE, 1=ERC20).
     * @param tokenAddress The address of the ERC20 token (if applicable).
     * @param ticketPrice The cost of a single ticket.
     * @param payoutAddress The address where ticket revenue will be sent.
     * @param startTime The start timestamp of the raffle.
     * @param endTime The end timestamp of the raffle.
     * @param minParticipants The minimum number of participants required.
     * @param isPublic Whether the raffle is public or private.
     * @param allowMultipleEntries Whether multiple entries per user are allowed.
     * @param fundingAmount The initial prize pool amount.
     * @param winnerPercentages The distribution of prizes among winners.
     */
    event RaffleCreated(
        uint256 indexed raffleId,
        address indexed creator,
        TokenType tokenType,
        address tokenAddress,
        uint256 ticketPrice,
        address payoutAddress,
        uint256 startTime,
        uint256 endTime,
        uint256 minParticipants,
        bool isPublic,
        bool allowMultipleEntries,
        uint256 fundingAmount,
        uint256[] winnerPercentages
    );

    /**
     * @notice Emitted when a user buys tickets for a raffle.
     * @param raffleId The ID of the raffle joined.
     * @param participant The address of the user joining.
     * @param amount The total amount paid for the tickets.
     * @param ticketCount The number of tickets purchased.
     */
    event UserJoinedRaffle(
        uint256 indexed raffleId,
        address indexed participant,
        uint256 amount,
        uint256 ticketCount
    );

    /**
     * @notice Emitted when winners are selected for a raffle.
     * @param raffleId The ID of the raffle.
     * @param winners The list of selected winner addresses.
     */
    event RaffleWinnersSelected(
        uint256 indexed raffleId,
        address[] winners
    );

    /**
     * @notice Emitted for each individual winner selected.
     * @param raffleId The ID of the raffle.
     * @param winner The address of the winner.
     * @param amount The prize amount allocated to this winner.
     * @param percentage The percentage of the prize pool won.
     */
    event WinnerSelected(
        uint256 indexed raffleId,
        address indexed winner,
        uint256 amount,
        uint256 percentage
    );

    /**
     * @notice Emitted when a winner claims their prize.
     * @param raffleId The ID of the raffle.
     * @param winner The address of the winner claiming the prize.
     * @param amount The amount claimed.
     */
    event PrizeClaimed(
        uint256 indexed raffleId,
        address indexed winner,
        uint256 amount
    );

    /**
     * @notice Emitted when a participant claims a refund for a cancelled raffle.
     * @param raffleId The ID of the cancelled raffle.
     * @param participant The address of the participant.
     * @param amount The amount refunded.
     */
    event RefundClaimed(
        uint256 indexed raffleId,
        address indexed participant,
        uint256 amount
    );

    /// @notice Emitted when a raffle is cancelled.
    event RaffleCancelled(uint256 indexed raffleId);

    /**
     * @notice Emitted when randomness is requested from Chainlink VRF.
     * @param raffleId The ID of the raffle.
     * @param requestId The Chainlink VRF request ID.
     */
    event RandomnessRequested(
        uint256 indexed raffleId,
        uint256 requestId
    );

    event GasLimitUpdated(uint32 newLimit);
    event CreationFeeUpdated(uint256 newBaseFee, uint256 newAdditionalFee);
    event PlatformFeeUpdated(uint256 newFeeBasisPoints);
    event FeeRecipientUpdated(address newRecipient);
    event GracePeriodUpdated(uint256 newPeriod);
    event KeyHashUpdated(bytes32 keyHash);
    event SubscriptionIdUpdated(uint256 subscriptionId);
    
    /**
     * @notice Emitted when a creator collects their ticket revenue.
     * @param raffleId The ID of the raffle.
     * @param creator The address of the creator.
     * @param amount The amount collected.
     */
    event CreatorEarningsClaimed(
        uint256 indexed raffleId,
        address indexed creator,
        uint256 amount
    );

    // --- Errors ---
    /// @notice Thrown when start/end times are invalid.
    error InvalidTimeRange();
    /// @notice Thrown when the payout address is the zero address.
    error InvalidPayoutAddress();
    /// @notice Thrown when participant limits or winner percentages are invalid.
    error InvalidParticipantLimits();
    /// @notice Thrown when attempting an action on an inactive or not-yet-started raffle.
    error RaffleNotActive();
    /// @notice Thrown when attempting an action after the raffle has ended.
    error RaffleEnded();
    /// @notice Thrown when the raffle has reached max participants.
    error RaffleFull();
    /// @notice Thrown when the payment amount is incorrect.
    error IncorrectPayment();
    /// @notice Thrown when the caller is not authorized to perform the action.
    error Unauthorized();
    /// @notice Thrown when winners have already been selected.
    error WinnersAlreadySelected();
    /// @notice Thrown when an invalid winner index is accessed (internal).
    error InvalidWinnerIndex();
    /// @notice Thrown when attempting to pick a winner before the raffle ends.
    error RaffleNotEnded();
    /// @notice Thrown when a user tries to join twice but multiple entries are disabled.
    error AlreadyJoined();
    /// @notice Thrown when winner percentages do not sum to 100 or are invalid.
    error InvalidWinnerPercentages();
    /// @notice Thrown when a private raffle signature is invalid.
    error InvalidSignature();
    /// @notice Thrown when a user tries to claim a prize but has none pending.
    error NoPendingWinnings();

    /// @notice Thrown when a token transfer fails.
    error TransferFailed();
    /// @notice Thrown when attempting to refund from a non-cancelled raffle.
    error RaffleNotCancelled();
    /// @notice Thrown when a user has no tickets to refund.
    error NothingToRefund();
    /// @notice Thrown when creator earnings have already been collected.
    error EarningsAlreadyCollected();
    /// @notice Thrown when there are no earnings to collect.
    error NoEarningsToCollect();
    /// @notice Thrown when a VRF request is already pending.
    error RandomnessRequestAlreadyInProgress();

    // --- Constructor ---

    /**
     * @notice Initializes the RifaChain contract.
     * @param _vrfCoordinator The address of the Chainlink VRF Coordinator.
     * @param _subscriptionId The Chainlink VRF Subscription ID.
     * @param _keyHash The Chainlink VRF Key Hash (Gas Lane).
     */
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        s_subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        feeRecipient = msg.sender; // Default fee recipient is deployer
    }

    // --- Admin Functions ---

    /**
     * @notice Sets the gas limit for the VRF callback.
     * @param _newLimit The new gas limit.
     */
    function setCallbackGasLimit(uint32 _newLimit) external onlyOwner {
        callbackGasLimit = _newLimit;
        emit GasLimitUpdated(_newLimit);
    }

    /**
     * @notice Updates the raffle creation fees.
     * @param _newBaseFee The base fee for a single winner.
     * @param _newAdditionalFee The fee for each additional winner.
     */
    function setCreationFees(uint256 _newBaseFee, uint256 _newAdditionalFee) external onlyOwner {
        baseCreationFee = _newBaseFee;
        additionalWinnerFee = _newAdditionalFee;
        emit CreationFeeUpdated(_newBaseFee, _newAdditionalFee);
    }

    /**
     * @notice Updates the platform fee percentage.
     * @param _newFeeBasisPoints The new fee in basis points (max 2000 = 20%).
     */
    function setPlatformFee(uint256 _newFeeBasisPoints) external onlyOwner {
        require(_newFeeBasisPoints <= 2000, "Fee too high"); // Max 20%
        platformFeeBasisPoints = _newFeeBasisPoints;
        emit PlatformFeeUpdated(_newFeeBasisPoints);
    }

    /**
     * @notice Updates the address that receives platform fees.
     * @param _newRecipient The new fee recipient address.
     */
    function setFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Invalid address");
        feeRecipient = _newRecipient;
        emit FeeRecipientUpdated(_newRecipient);
    }

    /**
     * @notice Updates the grace period for manual winner triggering.
     * @param _newPeriod The new grace period in seconds.
     */
    function setGracePeriod(uint256 _newPeriod) external onlyOwner {
        gracePeriod = _newPeriod;
        emit GracePeriodUpdated(_newPeriod);
    }

    /**
     * @notice Updates the Chainlink VRF Key Hash.
     * @param _keyHash The new key hash.
     */
    function setKeyHash(bytes32 _keyHash) external onlyOwner {
        keyHash = _keyHash;
        emit KeyHashUpdated(_keyHash);
    }

    /**
     * @notice Updates the Chainlink VRF Subscription ID.
     * @param _subscriptionId The new subscription ID.
     */
    function setSubscriptionId(uint256 _subscriptionId) external onlyOwner {
        s_subscriptionId = _subscriptionId;
        emit SubscriptionIdUpdated(_subscriptionId);
    }

    /**
     * @notice Calculates the creation fee based on the number of winners.
     * @param _numWinners The number of winners configured for the raffle.
     * @return The total creation fee in wei.
     */
    function getCreationFee(uint256 _numWinners) public view returns (uint256) {
        if (_numWinners <= 1) return baseCreationFee;
        return baseCreationFee + ((_numWinners - 1) * additionalWinnerFee);
    }

    // --- Core Functions ---

    /**
     * @notice Creates a new raffle.
     * @param _title The title of the raffle.
     * @param _description The description of the raffle.
     * @param _startTime The start timestamp.
     * @param _endTime The end timestamp.
     * @param _minParticipants The minimum number of participants.
     * @param _maxParticipants The maximum number of participants (0 for unlimited).
     * @param _isPublic Whether the raffle is public.
     * @param _tokenType The token type for tickets (NATIVE or ERC20).
     * @param _tokenAddress The address of the ERC20 token (if applicable).
     * @param _ticketPrice The price per ticket.
     * @param _payoutAddress The address to receive ticket revenue.
     * @param _allowMultipleEntries Whether multiple entries are allowed.
     * @param _fundingAmount The initial prize pool amount to be deposited.
     * @param _winnerPercentages Array of prize percentages for winners.
     */
    function createRaffle(
        string memory _title,
        string memory _description,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _minParticipants,
        uint256 _maxParticipants,
        bool _isPublic,
        TokenType _tokenType,
        address _tokenAddress,
        uint256 _ticketPrice,
        address _payoutAddress,
        bool _allowMultipleEntries,
        uint256 _fundingAmount,
        uint256[] memory _winnerPercentages
    ) external payable {
        if (_startTime < block.timestamp - 1 hours) revert InvalidTimeRange();
        if (_startTime >= _endTime) revert InvalidTimeRange();
        if (_endTime > block.timestamp + 14 days) revert InvalidTimeRange();
        if (_payoutAddress == address(0)) revert InvalidPayoutAddress();
        if (_maxParticipants > 0 && _minParticipants > _maxParticipants) revert InvalidParticipantLimits();
        
        uint256 totalPercentage = 0;
        for (uint256 i = 0; i < _winnerPercentages.length; i++) {
            if (_winnerPercentages[i] == 0 || _winnerPercentages[i] > 100) revert InvalidWinnerPercentages();
            totalPercentage += _winnerPercentages[i];
        }
        if (totalPercentage != 100) revert InvalidWinnerPercentages();
        if (_winnerPercentages.length > 5) revert InvalidWinnerPercentages();
        
        if (_minParticipants < _winnerPercentages.length) revert InvalidParticipantLimits();
        if (_minParticipants < 1) revert InvalidParticipantLimits();

        raffleCount++;
        
        uint256 newRaffleId = uint256(keccak256(abi.encodePacked(msg.sender, block.prevrandao, block.timestamp, raffleCount)));
        
        while (raffles[newRaffleId].id != 0) {
            newRaffleId = uint256(keccak256(abi.encodePacked(newRaffleId, block.timestamp)));
        }

        raffles[newRaffleId] = Raffle({
            id: newRaffleId,
            creator: msg.sender,
            title: _title,
            description: _description,
            startTime: _startTime,
            endTime: _endTime,
            minParticipants: _minParticipants,
            maxParticipants: _maxParticipants,
            isPublic: _isPublic,
            tokenType: _tokenType,
            tokenAddress: _tokenAddress,
            ticketPrice: _ticketPrice,
            payoutAddress: _payoutAddress,
            isActive: true,
            winnersSelected: false,
            requestId: 0,
            allowMultipleEntries: _allowMultipleEntries,
            fundingAmount: _fundingAmount,
            prizePool: _fundingAmount,
            ticketRevenue: 0,
            winnerPercentages: _winnerPercentages,
            isCancelled: false,
            earningsCollected: false
        });

        uint256 fee = getCreationFee(_winnerPercentages.length);
        uint256 requiredValue = fee;
        if (_tokenType == TokenType.NATIVE) {
            requiredValue += _fundingAmount;
        }

        if (msg.value != requiredValue) revert IncorrectPayment();

        if (fee > 0) {
            (bool success, ) = feeRecipient.call{value: fee}("");
            if (!success) revert TransferFailed();
        }

        if (_tokenType == TokenType.ERC20 && _fundingAmount > 0) {
            IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _fundingAmount);
        }

        emit RaffleCreated(
            newRaffleId,
            msg.sender,
            _tokenType,
            _tokenAddress,
            _ticketPrice,
            _payoutAddress,
            _startTime,
            _endTime,
            _minParticipants,
            _isPublic,
            _allowMultipleEntries,
            _fundingAmount,
            _winnerPercentages
        );
    }

    /**
     * @notice Allows a user to join a raffle by purchasing tickets.
     * @param _raffleId The ID of the raffle to join.
     * @param _ticketCount The number of tickets to purchase.
     * @param _signature The digital signature for private raffles (empty for public).
     */
    function joinRaffle(uint256 _raffleId, uint256 _ticketCount, bytes calldata _signature) external payable nonReentrant {
        if (_ticketCount == 0) revert IncorrectPayment();
        Raffle storage raffle = raffles[_raffleId];

        if (!raffle.isActive) revert RaffleNotActive();
        if (block.timestamp < raffle.startTime) revert RaffleNotActive();
        if (block.timestamp > raffle.endTime) revert RaffleEnded();

        if (raffle.winnersSelected) revert RaffleEnded();
        if (raffle.isCancelled) revert RaffleEnded();
        
        if (raffle.maxParticipants > 0 && participants[_raffleId].length + _ticketCount > raffle.maxParticipants) {
            revert RaffleFull();
        }

        if (!raffle.isPublic) {
            bytes32 message = keccak256(abi.encodePacked(_raffleId, msg.sender));
            bytes32 ethSignedMessageHash = message.toEthSignedMessageHash();
            address signer = ethSignedMessageHash.recover(_signature);
            if (signer != raffle.creator) revert InvalidSignature();
        }

        if (!raffle.allowMultipleEntries) {
            if (ticketCounts[_raffleId][msg.sender] > 0) revert AlreadyJoined();
            if (_ticketCount > 1) revert AlreadyJoined();
        }

        if (raffle.ticketPrice == 0) {
            if (ticketCounts[_raffleId][msg.sender] > 0) revert AlreadyJoined();
            if (_ticketCount > 1) revert AlreadyJoined();
        }

        uint256 totalPrice = raffle.ticketPrice * _ticketCount;

        if (raffle.ticketPrice > 0) {
            if (raffle.tokenType == TokenType.NATIVE) {
                if (msg.value != totalPrice) revert IncorrectPayment();
            } else if (raffle.tokenType == TokenType.ERC20) {
                if (msg.value > 0) revert IncorrectPayment();
                IERC20 token = IERC20(raffle.tokenAddress);
                token.safeTransferFrom(msg.sender, address(this), totalPrice);
            }
        } else {
            if (msg.value > 0) revert IncorrectPayment();
        }

        raffle.ticketRevenue += totalPrice;
        ticketCounts[_raffleId][msg.sender] += _ticketCount;
        for (uint256 i = 0; i < _ticketCount; i++) {
            participants[_raffleId].push(msg.sender);
        }

        emit UserJoinedRaffle(_raffleId, msg.sender, totalPrice, participants[_raffleId].length);
    }

    /**
     * @notice Requests a random winner from Chainlink VRF.
     * @dev Can be called by the creator, owner, or any participant (after grace period).
     * @param _raffleId The ID of the raffle.
     */
    function requestRandomWinner(uint256 _raffleId) external nonReentrant {
        Raffle storage raffle = raffles[_raffleId];
        
        bool isGracePeriodOver = block.timestamp > raffle.endTime + gracePeriod;
        bool isParticipant = ticketCounts[_raffleId][msg.sender] > 0;

        if (msg.sender != raffle.creator && msg.sender != owner() && !(isParticipant && isGracePeriodOver)) revert Unauthorized();
        if (raffle.winnersSelected) revert WinnersAlreadySelected();
        
        bool timeEnded = block.timestamp > raffle.endTime;
        bool minReached = raffle.minParticipants > 0 && participants[_raffleId].length >= raffle.minParticipants;
        
        if (!timeEnded && !minReached) revert RaffleNotEnded();
        if (participants[_raffleId].length == 0) revert RaffleNotActive();
        if (participants[_raffleId].length < raffle.winnerPercentages.length) revert InvalidParticipantLimits();

        _requestRandomWinner(_raffleId);
    }

    function _requestRandomWinner(uint256 _raffleId) internal {
        Raffle storage raffle = raffles[_raffleId];
        
        if (raffle.winnersSelected) revert WinnersAlreadySelected();
        if (raffle.requestId != 0) revert RandomnessRequestAlreadyInProgress();

        VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash,
            subId: s_subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: uint32(raffle.winnerPercentages.length),
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
        });

        uint256 requestId = s_vrfCoordinator.requestRandomWords(req);

        raffle.requestId = requestId;
        requestIdToRaffleId[requestId] = _raffleId;

        emit RandomnessRequested(_raffleId, requestId);
    }

    /**
     * @notice Callback function used by VRF Coordinator to supply random numbers.
     * @dev Selects winners, distributes prizes, and collects platform fees.
     * @param requestId The ID of the VRF request.
     * @param randomWords The array of random numbers supplied by VRF.
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 raffleId = requestIdToRaffleId[requestId];
        Raffle storage raffle = raffles[raffleId];
        
        if (raffle.id == 0) return;
        if (raffle.winnersSelected) return;

        address[] memory currentParticipants = participants[raffleId];
        uint256 totalParticipants = currentParticipants.length;
        uint256 numWinners = raffle.winnerPercentages.length;
        
        if (totalParticipants < numWinners) return;

        address[] memory selectedWinners = new address[](numWinners);
        uint256[] memory pickedIndices = new uint256[](numWinners);
        
        for (uint256 i = 0; i < numWinners; i++) {
            uint256 randomVal = randomWords[i];
            uint256 winnerIndex = randomVal % totalParticipants;
            
            bool collision = true;
            uint256 attempts = 0;
            while (collision && attempts < 10) {
                collision = false;
                for (uint256 j = 0; j < i; j++) {
                    if (pickedIndices[j] == winnerIndex) {
                        collision = true;
                        break;
                    }
                }
                if (collision) {
                    randomVal = uint256(keccak256(abi.encode(randomVal, attempts)));
                    winnerIndex = randomVal % totalParticipants;
                    attempts++;
                }
            }
            
            pickedIndices[i] = winnerIndex;
            selectedWinners[i] = currentParticipants[winnerIndex];
        }

        raffle.winnersSelected = true;
        raffle.isActive = false;

        uint256 totalRevenue = raffle.ticketRevenue;
        uint256 feeAmount = (totalRevenue * platformFeeBasisPoints) / 10000;
        
        if (feeAmount > 0) {
             if (raffle.tokenType == TokenType.NATIVE) {
                (bool success, ) = feeRecipient.call{value: feeAmount}("");
                if (!success) revert TransferFailed();
            } else {
                IERC20(raffle.tokenAddress).safeTransfer(feeRecipient, feeAmount);
            }
        }

        uint256 distributablePrize = raffle.prizePool;

        for (uint256 i = 0; i < numWinners; i++) {
            raffleWinners[raffleId].push(selectedWinners[i]);
            userWinnings[selectedWinners[i]].push(raffleId);
            
            uint256 prizeAmount = (distributablePrize * raffle.winnerPercentages[i]) / 100;
            
            if (prizeAmount > 0) {
                pendingWinnings[raffleId][selectedWinners[i]] += prizeAmount;
            }
            
             emit WinnerSelected(raffleId, selectedWinners[i], prizeAmount, raffle.winnerPercentages[i]);
        }
        
        emit RaffleWinnersSelected(raffleId, selectedWinners);
    }

    /**
     * @notice Cancels a raffle and refunds the creator's prize pool.
     * @dev Can be called by creator (if no tickets sold) or participants (if failed or abandoned).
     * @param _raffleId The ID of the raffle to cancel.
     */
    function cancelRaffle(uint256 _raffleId) external nonReentrant {
        Raffle storage raffle = raffles[_raffleId];
        
        bool isCreator = msg.sender == raffle.creator;
        bool isParticipant = ticketCounts[_raffleId][msg.sender] > 0;
        bool isRaffleEnded = block.timestamp > raffle.endTime;
        bool minParticipantsReached = participants[_raffleId].length >= raffle.minParticipants;
        
        bool isFailedRaffle = isRaffleEnded && !minParticipantsReached;
        bool isGracePeriodOver = isRaffleEnded && block.timestamp > raffle.endTime + gracePeriod;

        if (!isCreator && !(isParticipant && (isFailedRaffle || isGracePeriodOver))) revert Unauthorized();
        
        if (raffle.winnersSelected) revert WinnersAlreadySelected();
        if (raffle.isCancelled) revert RaffleEnded();
        if (!isRaffleEnded) revert RaffleNotEnded();
        
        if (isCreator && minParticipantsReached && !isGracePeriodOver) revert InvalidParticipantLimits();

        raffle.isCancelled = true;
        raffle.isActive = false;

        if (raffle.fundingAmount > 0) {
            if (raffle.tokenType == TokenType.NATIVE) {
                (bool success, ) = raffle.creator.call{value: raffle.fundingAmount}("");
                if (!success) revert TransferFailed();
            } else {
                IERC20(raffle.tokenAddress).safeTransfer(raffle.creator, raffle.fundingAmount);
            }
        }

        emit RaffleCancelled(_raffleId);
    }

    /**
     * @notice Allows participants to withdraw their refund from a cancelled raffle.
     * @param _raffleId The ID of the cancelled raffle.
     */
    function withdrawRefund(uint256 _raffleId) external nonReentrant {
        Raffle storage raffle = raffles[_raffleId];
        
        if (!raffle.isCancelled) revert RaffleNotCancelled();
        
        uint256 tickets = ticketCounts[_raffleId][msg.sender];
        if (tickets == 0) revert NothingToRefund();

        uint256 refundAmount = tickets * raffle.ticketPrice;
        
        ticketCounts[_raffleId][msg.sender] = 0;

        if (refundAmount > 0) {
            if (raffle.tokenType == TokenType.NATIVE) {
                (bool success, ) = msg.sender.call{value: refundAmount}("");
                if (!success) revert TransferFailed();
            } else {
                IERC20(raffle.tokenAddress).safeTransfer(msg.sender, refundAmount);
            }
        }

        emit RefundClaimed(_raffleId, msg.sender, refundAmount);
    }

    /**
     * @notice Allows the creator to withdraw ticket revenue after the raffle ends.
     * @param _raffleId The ID of the raffle.
     */
    function withdrawCreatorEarnings(uint256 _raffleId) external nonReentrant {
        Raffle storage raffle = raffles[_raffleId];
        
        if (msg.sender != raffle.creator) revert Unauthorized();
        if (!raffle.winnersSelected) revert RaffleNotEnded();
        if (raffle.earningsCollected) revert EarningsAlreadyCollected();
        
        uint256 totalRevenue = raffle.ticketRevenue;
        uint256 feeAmount = (totalRevenue * platformFeeBasisPoints) / 10000;
        uint256 earnings = totalRevenue - feeAmount;
        
        if (earnings == 0) revert NoEarningsToCollect();
        
        raffle.earningsCollected = true;
        
        if (raffle.tokenType == TokenType.NATIVE) {
            (bool success, ) = raffle.payoutAddress.call{value: earnings}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(raffle.tokenAddress).safeTransfer(raffle.payoutAddress, earnings);
        }
        
        emit CreatorEarningsClaimed(_raffleId, msg.sender, earnings);
    }

    // --- View Functions ---

    /**
     * @notice Retrieves the full details of a raffle.
     * @param _raffleId The ID of the raffle.
     * @return The Raffle struct.
     */
    function getRaffle(uint256 _raffleId) external view returns (Raffle memory) {
        return raffles[_raffleId];
    }

    /**
     * @notice Retrieves the list of participants for a raffle.
     * @param _raffleId The ID of the raffle.
     * @return An array of participant addresses.
     */
    function getParticipants(uint256 _raffleId) external view returns (address[] memory) {
        return participants[_raffleId];
    }

    /**
     * @notice Checks the pending winnings for a specific winner in a raffle.
     * @param _raffleId The ID of the raffle.
     * @param _winner The address of the winner.
     * @return The amount of pending winnings.
     */
    function getPendingWinnings(uint256 _raffleId, address _winner) external view returns (uint256) {
        return pendingWinnings[_raffleId][_winner];
    }
    
    /**
     * @notice Retrieves the list of raffle IDs won by a user.
     * @param _user The address of the user.
     * @return An array of Raffle IDs.
     */
    function getUserWinnings(address _user) external view returns (uint256[] memory) {
        return userWinnings[_user];
    }

    /**
     * @notice Retrieves the list of winners for a raffle.
     * @param _raffleId The ID of the raffle.
     * @return An array of winner addresses.
     */
    function getRaffleWinners(uint256 _raffleId) external view returns (address[] memory) {
        return raffleWinners[_raffleId];
    }

    /**
     * @notice Allows a winner to claim their prize.
     * @param _raffleId The ID of the raffle.
     */
    function claimPrize(uint256 _raffleId) external nonReentrant {
        uint256 amount = pendingWinnings[_raffleId][msg.sender];
        if (amount == 0) revert NoPendingWinnings();

        pendingWinnings[_raffleId][msg.sender] = 0;

        Raffle storage raffle = raffles[_raffleId];
        if (raffle.tokenType == TokenType.NATIVE) {
            (bool success, ) = msg.sender.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(raffle.tokenAddress).safeTransfer(msg.sender, amount);
        }

        emit PrizeClaimed(_raffleId, msg.sender, amount);
    }
}
