const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FileRegistry", function () {
  let FileRegistry;
  let fileRegistry;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    FileRegistry = await ethers.getContractFactory("FileRegistry");
    fileRegistry = await FileRegistry.deploy();
    await fileRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await fileRegistry.owner()).to.equal(owner.address);
    });

    it("Should initialize with correct default values", async function () {
      expect(await fileRegistry.nextFileId()).to.equal(1);
      expect(await fileRegistry.totalFiles()).to.equal(0);
      expect(await fileRegistry.pricePerByte()).to.equal(1000000000000n); // 1e12
    });
  });

  describe("File Registration", function () {
    const testCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const testSize = 1024;
    const testMetadata = ethers.keccak256(ethers.toUtf8Bytes("test metadata"));

    it("Should register a new file", async function () {
      await expect(fileRegistry.connect(user1).registerFile(testCid, testSize, testMetadata))
        .to.emit(fileRegistry, "FileUploaded")
        .withArgs(1, testCid, user1.address, testSize, BigInt(testSize) * 1000000000000n);

      const file = await fileRegistry.getFile(1);
      expect(file.pieceCid).to.equal(testCid);
      expect(file.uploader).to.equal(user1.address);
      expect(file.fileSize).to.equal(testSize);
      expect(file.exists).to.be.true;
    });

    it("Should calculate correct storage price", async function () {
      const expectedPrice = await fileRegistry.calculateStoragePrice(testSize);
      expect(expectedPrice).to.equal(BigInt(testSize) * 1000000000000n);
    });

    it("Should not allow duplicate CIDs", async function () {
      await fileRegistry.connect(user1).registerFile(testCid, testSize, testMetadata);

      await expect(
        fileRegistry.connect(user2).registerFile(testCid, testSize * 2, testMetadata)
      ).to.be.revertedWith("FileRegistry: CID already exists");
    });

    it("Should not allow empty CID", async function () {
      await expect(
        fileRegistry.connect(user1).registerFile("", testSize, testMetadata)
      ).to.be.revertedWith("FileRegistry: Empty CID");
    });

    it("Should not allow zero file size", async function () {
      await expect(
        fileRegistry.connect(user1).registerFile(testCid, 0, testMetadata)
      ).to.be.revertedWith("FileRegistry: Zero file size");
    });
  });

  describe("File Status Management", function () {
    const testCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const testSize = 1024;
    const testMetadata = ethers.keccak256(ethers.toUtf8Bytes("test metadata"));

    beforeEach(async function () {
      await fileRegistry.connect(user1).registerFile(testCid, testSize, testMetadata);
    });

    it("Should link payment correctly", async function () {
      await expect(fileRegistry.linkPayment(1, user1.address, testSize))
        .to.emit(fileRegistry, "FilePaymentLinked")
        .withArgs(1, user1.address, testSize);

      const file = await fileRegistry.getFile(1);
      expect(file.status).to.equal(1); // Paid status
    });

    it("Should confirm storage correctly", async function () {
      await fileRegistry.linkPayment(1, user1.address, testSize);

      await expect(fileRegistry.confirmStorage(1))
        .to.emit(fileRegistry, "FileStorageConfirmed");

      const file = await fileRegistry.getFile(1);
      expect(file.status).to.equal(2); // Stored status
    });

    it("Should only allow owner to confirm storage", async function () {
      await fileRegistry.linkPayment(1, user1.address, testSize);

      await expect(
        fileRegistry.connect(user1).confirmStorage(1)
      ).to.be.revertedWithCustomError(fileRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Query Functions", function () {
    const testCid1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const testCid2 = "bafybeihpjhkhjgjgkghkjghjkghjkghjkghjkghjkghjkghjkghjkghjkgh";
    const testSize = 1024;
    const testMetadata = ethers.keccak256(ethers.toUtf8Bytes("test metadata"));

    beforeEach(async function () {
      await fileRegistry.connect(user1).registerFile(testCid1, testSize, testMetadata);
      await fileRegistry.connect(user1).registerFile(testCid2, testSize * 2, testMetadata);
      await fileRegistry.connect(user2).registerFile("different_cid", testSize, testMetadata);
    });

    it("Should get file ID by CID", async function () {
      expect(await fileRegistry.getFileIdByCid(testCid1)).to.equal(1);
      expect(await fileRegistry.getFileIdByCid(testCid2)).to.equal(2);
      expect(await fileRegistry.getFileIdByCid("nonexistent")).to.equal(0);
    });

    it("Should get user files", async function () {
      const user1Files = await fileRegistry.getUserFiles(user1.address);
      const user2Files = await fileRegistry.getUserFiles(user2.address);

      expect(user1Files.length).to.equal(2);
      expect(user1Files[0]).to.equal(1);
      expect(user1Files[1]).to.equal(2);

      expect(user2Files.length).to.equal(1);
      expect(user2Files[0]).to.equal(3);
    });

    it("Should get contract stats", async function () {
      const stats = await fileRegistry.getStats();
      expect(stats.totalFilesCount).to.equal(3);
      expect(stats.nextId).to.equal(4);
      expect(stats.currentPricePerByte).to.equal(1000000000000n);
    });
  });

  describe("Admin Functions", function () {
    it("Should update storage price", async function () {
      const newPrice = 2000000000000n; // 2e12

      await expect(fileRegistry.updateStoragePrice(newPrice))
        .to.emit(fileRegistry, "StoragePriceUpdated");

      expect(await fileRegistry.pricePerByte()).to.equal(newPrice);
    });

    it("Should only allow owner to update price", async function () {
      await expect(
        fileRegistry.connect(user1).updateStoragePrice(2000000000000n)
      ).to.be.revertedWithCustomError(fileRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should pause and unpause", async function () {
      await fileRegistry.pause();
      expect(await fileRegistry.paused()).to.be.true;

      await expect(
        fileRegistry.connect(user1).registerFile("test_cid", 1024, ethers.keccak256(ethers.toUtf8Bytes("test")))
      ).to.be.revertedWithCustomError(fileRegistry, "EnforcedPause");

      await fileRegistry.unpause();
      expect(await fileRegistry.paused()).to.be.false;
    });
  });
});