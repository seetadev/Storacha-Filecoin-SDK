const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying Storacha Filecoin Contracts...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "FIL\n");

  // USDFC token address (Calibration testnet)
  let USDFC_ADDRESS;
  if (process.env.USDFC_CONTRACT_ADDRESS) {
    USDFC_ADDRESS = ethers.getAddress(process.env.USDFC_CONTRACT_ADDRESS);
  } else {
    // Use deployer address as placeholder
    USDFC_ADDRESS = deployer.address;
    console.log("⚠️ Using deployer address as mock USDFC token locally");
  }

  console.log("Using USDFC contract address:", USDFC_ADDRESS);

  // Deploy FileRegistry
  console.log("📁 Deploying FileRegistry...");
  const FileRegistry = await ethers.getContractFactory("FileRegistry");
  const fileRegistry = await FileRegistry.deploy();
  await fileRegistry.waitForDeployment();

  const fileRegistryAddress = await fileRegistry.getAddress();
  console.log("✅ FileRegistry deployed to:", fileRegistryAddress);

  // Deploy PaymentEscrow
  console.log("\n💰 Deploying PaymentEscrow...");
  const PaymentEscrow = await ethers.getContractFactory("PaymentEscrow");
  const paymentEscrow = await PaymentEscrow.deploy(
    USDFC_ADDRESS, // USDFC token address
    fileRegistryAddress, // FileRegistry address
    deployer.address // Treasury address (todo: update)
  );
  await paymentEscrow.waitForDeployment();

  const paymentEscrowAddress = await paymentEscrow.getAddress();
  console.log("✅ PaymentEscrow deployed to:", paymentEscrowAddress);

  // Save deployment addresses
  const deploymentInfo = {
    network: process.env.HARDHAT_NETWORK || "localhost",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      FileRegistry: {
        address: fileRegistryAddress,
        transactionHash: fileRegistry.deploymentTransaction().hash,
      },
      PaymentEscrow: {
        address: paymentEscrowAddress,
        transactionHash: paymentEscrow.deploymentTransaction().hash,
      },
    },
    dependencies: {
      USDFC: USDFC_ADDRESS,
    },
  };

  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  let deployments = {};

  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }

  deployments[deploymentInfo.network] = deploymentInfo;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

  console.log("\n📋 Deployment Summary:");
  console.log("=".repeat(50));
  console.log(`Network: ${deploymentInfo.network}`);
  console.log(`FileRegistry: ${fileRegistryAddress}`);
  console.log(`PaymentEscrow: ${paymentEscrowAddress}`);
  console.log(`USDFC Token: ${USDFC_ADDRESS}`);
  console.log(`Treasury: ${deployer.address}`);
  console.log(`Deployment saved to: ${deploymentsPath}`);

  // Verify contracts on testnet
  if (
    process.env.HARDHAT_NETWORK !== "hardhat" &&
    process.env.HARDHAT_NETWORK !== "localhost"
  ) {
    console.log("\n🔍 Waiting before verification...");
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

    try {
      console.log("Verifying FileRegistry...");
      await hre.run("verify:verify", {
        address: fileRegistryAddress,
        constructorArguments: [],
      });

      console.log("Verifying PaymentEscrow...");
      await hre.run("verify:verify", {
        address: paymentEscrowAddress,
        constructorArguments: [
          USDFC_ADDRESS,
          fileRegistryAddress,
          deployer.address,
        ],
      });
    } catch (error) {
      console.log("❌ Verification failed:", error.message);
    }
  }

  console.log("\n🎉 Deployment complete!");

  // Show next steps
  console.log("\n📝 Next Steps:");
  console.log("1. Update backend/.env with contract addresses:");
  console.log(`   FILE_REGISTRY_ADDRESS=${fileRegistryAddress}`);
  console.log(`   PAYMENT_ESCROW_ADDRESS=${paymentEscrowAddress}`);
  console.log("2. Fund treasury account with USDFC tokens");
  console.log("3. Test file upload and payment flow");
  console.log("4. Update frontend with contract addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
