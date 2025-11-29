// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FileRegistry
 * @dev Tracks files uploaded to Filecoin warm storage via Synapse SDK
 */
contract FileRegistry is Ownable, ReentrancyGuard, Pausable {
    // File status enumeration
    enum FileStatus {
        Uploaded,       // File uploaded, payment pending
        Paid,          // Payment confirmed, awaiting storage
        Stored,        // File confirmed stored on Filecoin
        Retrieved      // File has been retrieved
    }

    // File record structure
    struct FileRecord {
        string pieceCid;        // Filecoin Piece CID
        address uploader;       // Who uploaded the file
        uint256 fileSize;      // Size in bytes
        uint256 storagePrice;  // USDFC cost for storage
        uint256 uploadTime;    // When file was uploaded
        uint256 paidTime;      // When payment was made (0 if unpaid)
        uint256 storedTime;    // When storage was confirmed (0 if not stored)
        FileStatus status;     // Current file status
        bytes32 metadataHash;  // IPFS hash of additional metadata
        bool exists;           // Flag to check if record exists
    }

    // State variables
    mapping(uint256 => FileRecord) public files;
    mapping(string => uint256) public cidToFileId;
    mapping(address => uint256[]) public userFiles;

    uint256 public nextFileId = 1;
    uint256 public totalFiles = 0;

    // Storage pricing (USDFC per byte per epoch)
    uint256 public pricePerByte = 1e12; // 0.000001 USDFC per byte

    // Events
    event FileUploaded(
        uint256 indexed fileId,
        string indexed pieceCid,
        address indexed uploader,
        uint256 fileSize,
        uint256 storagePrice
    );

    event FilePaymentLinked(
        uint256 indexed fileId,
        address indexed payer,
        uint256 amount
    );

    event FileStorageConfirmed(
        uint256 indexed fileId,
        string indexed pieceCid,
        uint256 timestamp
    );

    event FileRetrieved(
        uint256 indexed fileId,
        address indexed retriever,
        uint256 timestamp
    );

    event StoragePriceUpdated(
        uint256 oldPrice,
        uint256 newPrice
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Register a new file upload
     * @param pieceCid Filecoin Piece CID
     * @param fileSize Size of file in bytes
     * @param metadataHash IPFS hash of metadata (optional)
     * @return fileId The unique file identifier
     */
    function registerFile(
        string calldata pieceCid,
        uint256 fileSize,
        bytes32 metadataHash
    ) external whenNotPaused nonReentrant returns (uint256 fileId) {
        require(bytes(pieceCid).length > 0, "FileRegistry: Empty CID");
        require(fileSize > 0, "FileRegistry: Zero file size");
        require(cidToFileId[pieceCid] == 0, "FileRegistry: CID already exists");

        fileId = nextFileId++;
        uint256 storagePrice = calculateStoragePrice(fileSize);

        FileRecord storage file = files[fileId];
        file.pieceCid = pieceCid;
        file.uploader = msg.sender;
        file.fileSize = fileSize;
        file.storagePrice = storagePrice;
        file.uploadTime = block.timestamp;
        file.status = FileStatus.Uploaded;
        file.metadataHash = metadataHash;
        file.exists = true;

        cidToFileId[pieceCid] = fileId;
        userFiles[msg.sender].push(fileId);
        totalFiles++;

        emit FileUploaded(fileId, pieceCid, msg.sender, fileSize, storagePrice);
    }

    /**
     * @dev Link payment to a file (called by PaymentEscrow contract)
     * @param fileId The file identifier
     * @param payer Address that made the payment
     * @param amount Amount paid in USDFC
     */
    function linkPayment(
        uint256 fileId,
        address payer,
        uint256 amount
    ) external whenNotPaused {
        require(files[fileId].exists, "FileRegistry: File not found");
        require(files[fileId].status == FileStatus.Uploaded, "FileRegistry: Invalid status");

        files[fileId].status = FileStatus.Paid;
        files[fileId].paidTime = block.timestamp;

        emit FilePaymentLinked(fileId, payer, amount);
    }

    /**
     * @dev Confirm file storage on Filecoin (called by backend)
     * @param fileId The file identifier
     */
    function confirmStorage(uint256 fileId) external onlyOwner whenNotPaused {
        require(files[fileId].exists, "FileRegistry: File not found");
        require(files[fileId].status == FileStatus.Paid, "FileRegistry: Payment required");

        files[fileId].status = FileStatus.Stored;
        files[fileId].storedTime = block.timestamp;

        emit FileStorageConfirmed(fileId, files[fileId].pieceCid, block.timestamp);
    }

    /**
     * @dev Mark file as retrieved
     * @param fileId The file identifier
     */
    function markRetrieved(uint256 fileId) external whenNotPaused {
        require(files[fileId].exists, "FileRegistry: File not found");
        require(files[fileId].status == FileStatus.Stored, "FileRegistry: Not stored yet");

        files[fileId].status = FileStatus.Retrieved;

        emit FileRetrieved(fileId, msg.sender, block.timestamp);
    }

    /**
     * @dev Calculate storage price for a file
     * @param fileSize Size in bytes
     * @return price Price in USDFC wei
     */
    function calculateStoragePrice(uint256 fileSize) public view returns (uint256 price) {
        price = fileSize * pricePerByte;
    }

    /**
     * @dev Get file information
     * @param fileId The file identifier
     * @return file The file record
     */
    function getFile(uint256 fileId) external view returns (FileRecord memory file) {
        require(files[fileId].exists, "FileRegistry: File not found");
        file = files[fileId];
    }

    /**
     * @dev Get file ID by CID
     * @param pieceCid The Piece CID
     * @return fileId The file identifier (0 if not found)
     */
    function getFileIdByCid(string calldata pieceCid) external view returns (uint256 fileId) {
        fileId = cidToFileId[pieceCid];
    }

    /**
     * @dev Get files uploaded by a user
     * @param user The user address
     * @return fileIds Array of file identifiers
     */
    function getUserFiles(address user) external view returns (uint256[] memory fileIds) {
        fileIds = userFiles[user];
    }

    /**
     * @dev Check if file is paid and stored
     * @param fileId The file identifier
     * @return isPaid True if file payment is confirmed
     * @return isStored True if file is stored on Filecoin
     */
    function getFileStatus(uint256 fileId) external view returns (bool isPaid, bool isStored) {
        require(files[fileId].exists, "FileRegistry: File not found");

        FileStatus status = files[fileId].status;
        isPaid = (status == FileStatus.Paid || status == FileStatus.Stored || status == FileStatus.Retrieved);
        isStored = (status == FileStatus.Stored || status == FileStatus.Retrieved);
    }

    // Admin functions
    /**
     * @dev Update storage pricing (admin only)
     * @param newPricePerByte New price per byte in USDFC wei
     */
    function updateStoragePrice(uint256 newPricePerByte) external onlyOwner {
        uint256 oldPrice = pricePerByte;
        pricePerByte = newPricePerByte;

        emit StoragePriceUpdated(oldPrice, newPricePerByte);
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
        uint256 totalFilesCount,
        uint256 nextId,
        uint256 currentPricePerByte
    ) {
        totalFilesCount = totalFiles;
        nextId = nextFileId;
        currentPricePerByte = pricePerByte;
    }
}