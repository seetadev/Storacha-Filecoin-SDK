// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IFileRegistry {
    function linkPayment(uint256 fileId, address payer, uint256 amount) external;
    function getFile(uint256 fileId) external view returns (
        string memory pieceCid,
        address uploader,
        uint256 fileSize,
        uint256 storagePrice,
        uint256 uploadTime,
        uint256 paidTime,
        uint256 storedTime,
        uint8 status,
        bytes32 metadataHash,
        bool exists
    );
    function getFileStatus(uint256 fileId) external view returns (bool isPaid, bool isStored);
}

/**
 * @title PaymentEscrow
 * @dev Handles USDFC payments for file storage with escrow functionality
 */
contract PaymentEscrow is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Escrow record structure
    struct EscrowRecord {
        uint256 fileId;         // Reference to FileRegistry
        address payer;          // Who pays for storage
        address provider;       // Storage provider (treasury for now)
        uint256 amount;         // USDFC locked in escrow
        uint256 lockTime;       // When escrow was created
        bool released;          // Has provider been paid
        bool refunded;          // Has payer been refunded
    }

    // State variables
    IERC20 public immutable usdfc;
    IFileRegistry public immutable fileRegistry;

    mapping(uint256 => EscrowRecord) public escrows;
    mapping(uint256 => uint256) public fileToEscrow; // fileId => escrowId
    mapping(address => uint256[]) public userEscrows;

    uint256 public nextEscrowId = 1;
    address public treasury; // Where payments are sent (storage provider)
    uint256 public totalEscrowed = 0;
    uint256 public totalReleased = 0;

    // Events
    event PaymentDeposited(
        uint256 indexed escrowId,
        uint256 indexed fileId,
        address indexed payer,
        uint256 amount
    );

    event PaymentReleased(
        uint256 indexed escrowId,
        uint256 indexed fileId,
        address indexed provider,
        uint256 amount
    );

    event PaymentRefunded(
        uint256 indexed escrowId,
        uint256 indexed fileId,
        address indexed payer,
        uint256 amount
    );

    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    constructor(
        address _usdfc,
        address _fileRegistry,
        address _treasury
    ) Ownable(msg.sender) {
        require(_usdfc != address(0), "PaymentEscrow: Invalid USDFC address");
        require(_fileRegistry != address(0), "PaymentEscrow: Invalid FileRegistry address");
        require(_treasury != address(0), "PaymentEscrow: Invalid treasury address");

        usdfc = IERC20(_usdfc);
        fileRegistry = IFileRegistry(_fileRegistry);
        treasury = _treasury;
    }

    /**
     * @dev Deposit USDFC payment for a file
     * @param fileId The file identifier
     * @param amount Amount to deposit (must match file's storage price)
     */
    function depositForFile(uint256 fileId, uint256 amount) external whenNotPaused nonReentrant {
        // Verify file exists and get details
        (
            , // pieceCid
            , // uploader
            , // fileSize
            uint256 storagePrice,
            , // uploadTime
            , // paidTime
            , // storedTime
            , // status
            , // metadataHash
            bool exists
        ) = fileRegistry.getFile(fileId);

        require(exists, "PaymentEscrow: File not found");
        require(amount == storagePrice, "PaymentEscrow: Incorrect payment amount");
        require(fileToEscrow[fileId] == 0, "PaymentEscrow: File already paid");

        // Check file hasn't been paid yet
        (bool isPaid, ) = fileRegistry.getFileStatus(fileId);
        require(!isPaid, "PaymentEscrow: File already paid");

        // Transfer USDFC from user to this contract
        usdfc.safeTransferFrom(msg.sender, address(this), amount);

        // Create escrow record
        uint256 escrowId = nextEscrowId++;
        EscrowRecord storage escrow = escrows[escrowId];
        escrow.fileId = fileId;
        escrow.payer = msg.sender;
        escrow.provider = treasury;
        escrow.amount = amount;
        escrow.lockTime = block.timestamp;

        fileToEscrow[fileId] = escrowId;
        userEscrows[msg.sender].push(escrowId);
        totalEscrowed += amount;

        // Notify FileRegistry about payment
        fileRegistry.linkPayment(fileId, msg.sender, amount);

        emit PaymentDeposited(escrowId, fileId, msg.sender, amount);
    }

    /**
     * @dev Release payment to storage provider (called after storage confirmation)
     * @param fileId The file identifier
     */
    function releasePayment(uint256 fileId) external onlyOwner whenNotPaused nonReentrant {
        uint256 escrowId = fileToEscrow[fileId];
        require(escrowId != 0, "PaymentEscrow: No payment for file");

        EscrowRecord storage escrow = escrows[escrowId];
        require(!escrow.released, "PaymentEscrow: Already released");
        require(!escrow.refunded, "PaymentEscrow: Already refunded");

        // Verify file is stored
        (, bool isStored) = fileRegistry.getFileStatus(fileId);
        require(isStored, "PaymentEscrow: File not stored yet");

        // Release payment to provider
        escrow.released = true;
        totalReleased += escrow.amount;

        usdfc.safeTransfer(escrow.provider, escrow.amount);

        emit PaymentReleased(escrowId, fileId, escrow.provider, escrow.amount);
    }

    /**
     * @dev Refund payment to user (in case of storage failure)
     * @param fileId The file identifier
     */
    function refundPayment(uint256 fileId) external onlyOwner whenNotPaused nonReentrant {
        uint256 escrowId = fileToEscrow[fileId];
        require(escrowId != 0, "PaymentEscrow: No payment for file");

        EscrowRecord storage escrow = escrows[escrowId];
        require(!escrow.released, "PaymentEscrow: Already released");
        require(!escrow.refunded, "PaymentEscrow: Already refunded");

        // Only allow refund if payment is old (7 days) and storage not confirmed
        require(
            block.timestamp >= escrow.lockTime + 7 days,
            "PaymentEscrow: Too early for refund"
        );

        (, bool isStored) = fileRegistry.getFileStatus(fileId);
        require(!isStored, "PaymentEscrow: File already stored");

        // Refund to original payer
        escrow.refunded = true;

        usdfc.safeTransfer(escrow.payer, escrow.amount);

        emit PaymentRefunded(escrowId, fileId, escrow.payer, escrow.amount);
    }

    /**
     * @dev Emergency refund (admin only, for exceptional cases)
     * @param escrowId The escrow identifier
     */
    function emergencyRefund(uint256 escrowId) external onlyOwner whenNotPaused nonReentrant {
        EscrowRecord storage escrow = escrows[escrowId];
        require(escrow.amount > 0, "PaymentEscrow: Invalid escrow");
        require(!escrow.released, "PaymentEscrow: Already released");
        require(!escrow.refunded, "PaymentEscrow: Already refunded");

        escrow.refunded = true;
        usdfc.safeTransfer(escrow.payer, escrow.amount);

        emit PaymentRefunded(escrowId, escrow.fileId, escrow.payer, escrow.amount);
    }

    /**
     * @dev Get escrow details
     * @param escrowId The escrow identifier
     * @return escrow The escrow record
     */
    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory escrow) {
        escrow = escrows[escrowId];
    }

    /**
     * @dev Get escrow by file ID
     * @param fileId The file identifier
     * @return escrowId The escrow identifier
     * @return escrow The escrow record
     */
    function getEscrowByFile(uint256 fileId) external view returns (
        uint256 escrowId,
        EscrowRecord memory escrow
    ) {
        escrowId = fileToEscrow[fileId];
        if (escrowId != 0) {
            escrow = escrows[escrowId];
        }
    }

    /**
     * @dev Get user's escrows
     * @param user The user address
     * @return escrowIds Array of escrow identifiers
     */
    function getUserEscrows(address user) external view returns (uint256[] memory escrowIds) {
        escrowIds = userEscrows[user];
    }

    /**
     * @dev Check if file payment is in escrow
     * @param fileId The file identifier
     * @return hasPayment True if payment exists
     * @return amount Amount in escrow
     * @return isReleased True if payment has been released
     */
    function getFilePaymentStatus(uint256 fileId) external view returns (
        bool hasPayment,
        uint256 amount,
        bool isReleased
    ) {
        uint256 escrowId = fileToEscrow[fileId];
        if (escrowId != 0) {
            EscrowRecord memory escrow = escrows[escrowId];
            hasPayment = true;
            amount = escrow.amount;
            isReleased = escrow.released;
        }
    }

    // Admin functions
    /**
     * @dev Update treasury address (admin only)
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "PaymentEscrow: Invalid treasury address");
        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @dev Pause contract (admin only)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract (admin only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Get contract stats
     */
    function getStats() external view returns (
        uint256 totalEscrowedAmount,
        uint256 totalReleasedAmount,
        uint256 totalPendingAmount,
        uint256 nextId
    ) {
        totalEscrowedAmount = totalEscrowed;
        totalReleasedAmount = totalReleased;
        totalPendingAmount = totalEscrowed - totalReleased;
        nextId = nextEscrowId;
    }

    /**
     * @dev Emergency withdraw (admin only, for contract upgrades)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(amount <= usdfc.balanceOf(address(this)), "PaymentEscrow: Insufficient balance");
        usdfc.safeTransfer(owner(), amount);
    }
}