import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * This script fetches Pyth oracle price feeds from devnet and creates a script to clone them into
 * the local test validator when it's restarted
 */
async function main() {
    console.log('Setting up Pyth price feeds from devnet to local test validator...');
    
    const priceFeedIds = {
        "SOL": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        "USDC": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
        "USDT": "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
        "TRUMP": "0x879551021853eec7a7dc827578e8e69da7e4fa8148339aa0d3d5296405be4b1a",
        "JLP": "0xc811abc82b4bad1f9bd711a2773ccaa935b03ecef974236942cec5e0eb845a3a"
    };

    // Directory for storing price feed data
    const priceFeedsDir = path.join(__dirname, '..', 'price-feeds');
    if (!fs.existsSync(priceFeedsDir)) {
        fs.mkdirSync(priceFeedsDir, { recursive: true });
    }

    // Connect to devnet to fetch Pyth accounts
    const devnetConnection = new Connection('https://api.devnet.solana.com');
    
    // First, let's get the Pyth program itself
    const pythProgramId = new PublicKey('pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT');
    console.log('Fetching Pyth program account from devnet...');
    const pythProgramInfo = await devnetConnection.getAccountInfo(pythProgramId);
    
    if (!pythProgramInfo) {
        throw new Error('Failed to fetch Pyth program account from devnet');
    }

    // Setup for PythSolanaReceiver
    const keypair = Keypair.generate();
    const wallet = {
        publicKey: keypair.publicKey,
        payer: keypair,
        signTransaction: async (tx) => {
            tx.partialSign(keypair);
            return tx;
        },
        signAllTransactions: async (txs) => {
            return txs.map(tx => {
                tx.partialSign(keypair);
                return tx;
            });
        },
    };
    
    // Initialize Pyth Solana Receiver
    const pythSolanaReceiver = new PythSolanaReceiver({
        connection: devnetConnection,
        wallet,
    });
    
    // Define interface for price feed info
    interface PriceFeedInfo {
        symbol: string;
        feedId: string;
        address: string;
    }

    // Create a mapping file to store the price feed info
    const priceFeedMapping: {
        pythProgramId: string;
        priceFeeds: Record<string, PriceFeedInfo>;
    } = {
        pythProgramId: pythProgramId.toString(),
        priceFeeds: {}
    };
    
    // Collect all price feed addresses
    for (const [symbol, feedId] of Object.entries(priceFeedIds)) {
        console.log(`Processing ${symbol} price feed...`);
        
        // Get price feed account address
        const priceFeedAccountAddress = pythSolanaReceiver
            .getPriceFeedAccountAddress(0, feedId);
        
        const priceFeedAddressStr = priceFeedAccountAddress.toString();
        console.log(`${symbol} price feed account: ${priceFeedAddressStr}`);
        
        // Save to mapping
        priceFeedMapping.priceFeeds[symbol] = {
            symbol,
            feedId,
            address: priceFeedAddressStr
        };
    }
    
    // Save mapping information for later use
    const mappingPath = path.join(priceFeedsDir, 'pyth_mapping.json');
    fs.writeFileSync(
        mappingPath,
        JSON.stringify(priceFeedMapping, null, 2)
    );
    
    // Create a clone script that will restart the validator with the Pyth accounts
    console.log('Creating restart script with Pyth accounts...');
    const restartScript = path.join(priceFeedsDir, 'restart_with_pyth.sh');
    
    let script = `#!/bin/bash

# This script restarts the Solana validator with Pyth accounts cloned from devnet
echo "Stopping existing validator..."
pkill solana-test-validator

# Wait for the validator to stop
sleep 3

# Create required program directories
mkdir -p ./price-feeds

# Identify signer keypair
SIGNER_KEYPAIR="./keys/signer.json"

# Get the Pyth program from devnet
echo "Fetching Pyth program from devnet..."
solana program dump -u devnet ${pythProgramId.toString()} ./price-feeds/pyth_program.so

# Get Metaplex program from mainnet
echo "Fetching Metaplex program from mainnet..."
export METAPLEX_PROGRAM_ADDRESS="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
solana program dump -u m \${METAPLEX_PROGRAM_ADDRESS} ./price-feeds/metaplex_program.so

# Start validator with cloned accounts
echo "Starting validator with Pyth accounts cloned from devnet..."
solana-test-validator \\
  --bpf-program \${METAPLEX_PROGRAM_ADDRESS} ./price-feeds/metaplex_program.so \\
  --bpf-program ${pythProgramId.toString()} ./price-feeds/pyth_program.so \\`;

    // Add all price feed accounts to clone
    for (const [symbol, feed] of Object.entries(priceFeedMapping.priceFeeds)) {
        script += `\n  --clone ${feed.address} \\`;
    }
    
    // Add validator URL only once at the end
    script += `\n  -u devnet \\
  -r &

# Wait for validator to start
sleep 10

# Configure solana CLI to use local validator and signer keypair
solana config set --url http://localhost:8899 --keypair \${SIGNER_KEYPAIR}

# Wait to ensure validator is ready
sleep 5

echo "Validator restarted with Pyth accounts!"
echo "You can now view the Pyth accounts in Solana Explorer:"
echo "- Pyth Program: https://explorer.solana.com/address/${pythProgramId.toString()}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899"
`;

    // Add explorer URLs for all price feeds
    for (const [symbol, feed] of Object.entries(priceFeedMapping.priceFeeds)) {
        script += `echo "- ${symbol} Price Feed: https://explorer.solana.com/address/${feed.address}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899"\n`;
    }
    
    fs.writeFileSync(restartScript, script);
    fs.chmodSync(restartScript, 0o755); // Make executable
    
    console.log('\nSetup complete!');
    console.log('Pyth price feed mapping saved to:', mappingPath);
    console.log('\nTo deploy Pyth accounts to the local validator, run:');
    console.log(`bash ${restartScript}`);
    console.log('\nAfter running the restart script, you can use these price feeds in your application.');
    console.log('Example code to access Pyth price feeds:');
    console.log(`
// Example code to get price from a Pyth feed on localnet:
import { Connection, PublicKey } from '@solana/web3.js';
import { PriceData } from '@pythnetwork/client';

const connection = new Connection('http://localhost:8899');
const address = new PublicKey('${priceFeedMapping.priceFeeds['SOL']?.address || '[PRICE_FEED_ADDRESS]'}');

// Fetch the Pyth account data
const accountInfo = await connection.getAccountInfo(address);
if (accountInfo) {
    // Parse the price data
    const priceData = PriceData.parse(accountInfo.data);
    
    // Get the current price
    const price = priceData.price;
    const confidence = priceData.confidence;
    console.log(\`SOL price: \${price} USD (confidence: \${confidence})\`);
}
`);
}

main().catch(console.error);