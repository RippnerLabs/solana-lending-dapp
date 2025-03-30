import { BN, Program } from '@coral-xyz/anchor';
import { BankrunProvider } from 'anchor-bankrun';
import { TOKEN_PROGRAM_ID} from '@solana/spl-token';
import { createAccount, createMint, mintTo } from 'spl-token-bankrun';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';
import { startAnchor, BanksClient, ProgramTestContext } from 'solana-bankrun';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import IDL from '../target/idl/lending.json';
import { Lending } from '../target/types/lending';
import { BankrunContextWrapper } from './bankrun-utils/bankrunConnection';

describe('Lending Smart Contract Tests', () => {
  let signer: Keypair;
  let usdcBankAccount: PublicKey;
  let solBankAccount: PublicKey;
  let solBankTokenAccount: PublicKey;
  let usdcBankTokenAccount: PublicKey;
  let provider: BankrunProvider;
  let program: Program<Lending>;
  let banksClient: BanksClient;
  let context: ProgramTestContext;
  let bankrunContextWrapper: BankrunContextWrapper;
  let mintUSDC: PublicKey;
  let mintSOL: PublicKey;
  let solUsdPriceFeedAccountPubkey: PublicKey;
  let usdcUsdPriceFeedAccountPubkey: PublicKey;
  let connection: Connection;
  let solUsdPriceFeedAccount: string;
  let usdcUsdPriceFeedAccount: string;
  let pythSolanaReceiver: PythSolanaReceiver;
  const SOL_PRICE_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
  const USDC_PRICE_FEED_ID = '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';

  beforeAll(async () => {
    const pyth = new PublicKey('pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT');
    const devnetConnection = new Connection('https://api.devnet.solana.com');
    const accountInfo = await devnetConnection.getAccountInfo(pyth);

    context = await startAnchor(
      '',
      [{ name: 'lending', programId: new PublicKey(IDL.address) }],
      [
        {
          address: pyth,
          info: accountInfo,
        },
      ],
      BigInt(500000),
    );
    provider = new BankrunProvider(context);
    bankrunContextWrapper = new BankrunContextWrapper(context);
    connection = bankrunContextWrapper.connection.toConnection();

    pythSolanaReceiver = new PythSolanaReceiver({
      connection,
      wallet: provider.wallet,
    });

    solUsdPriceFeedAccount = pythSolanaReceiver
      .getPriceFeedAccountAddress(0, SOL_PRICE_FEED_ID)
      .toBase58();

    solUsdPriceFeedAccountPubkey = new PublicKey(solUsdPriceFeedAccount);
    const solFeedAccountInfo = await devnetConnection.getAccountInfo(
      solUsdPriceFeedAccountPubkey
    );

    context.setAccount(solUsdPriceFeedAccountPubkey, solFeedAccountInfo);


    usdcUsdPriceFeedAccount = pythSolanaReceiver
      .getPriceFeedAccountAddress(0, USDC_PRICE_FEED_ID)
      .toBase58();

    usdcUsdPriceFeedAccountPubkey = new PublicKey(usdcUsdPriceFeedAccount);
    const usdcFeedAccountInfo = await devnetConnection.getAccountInfo(
      usdcUsdPriceFeedAccountPubkey
    );

    context.setAccount(usdcUsdPriceFeedAccountPubkey, usdcFeedAccountInfo);

    console.log('pricefeed:', solUsdPriceFeedAccount);
    console.log('Pyth Account Info:', accountInfo);

    program = new Program<Lending>(IDL as Lending, provider);
    banksClient = context.banksClient;
    signer = provider.wallet.payer;

    mintUSDC = await createMint(
      // @ts-ignore
      banksClient,
      signer,
      signer.publicKey,
      null,
      6 // Changed to 6 decimals for USDC
    );

    mintSOL = await createMint(
      // @ts-ignore
      banksClient,
      signer,
      signer.publicKey,
      null,
      9 // Changed to 9 decimals for SOL
    );

    [usdcBankAccount] = PublicKey.findProgramAddressSync(
      [mintUSDC.toBuffer()],
      program.programId
    );

    [usdcBankTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), mintUSDC.toBuffer()],
      program.programId
    );

    [solBankAccount] = PublicKey.findProgramAddressSync(
      [mintSOL.toBuffer()],
      program.programId
    );

    [solBankTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), mintSOL.toBuffer()],
      program.programId
    );

    console.log('USDC Bank Account', usdcBankAccount.toBase58());
    console.log('SOL Bank Account', solBankAccount.toBase58());
    console.log('SOL Bank Token Account', solBankTokenAccount.toBase58());
    console.log('USDC Bank Token Account', usdcBankTokenAccount.toBase58());
  }, 30000);

  it('Test store symbol feed id', async () => {
    const storeSymbolFeedIdTx = await program.methods
      .storeSymbolFeedId('SOL', SOL_PRICE_FEED_ID)
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: 'confirmed' });

    expect(storeSymbolFeedIdTx).toBeTruthy();

    const storeSymbolFeedIdTx2 = await program.methods
      .storeSymbolFeedId('USDC', USDC_PRICE_FEED_ID)
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: 'confirmed' });

    expect(storeSymbolFeedIdTx2).toBeTruthy();
  });

  it('Test Init User', async () => {
    const initUser = await program.methods
      .initUser()
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: 'confirmed' });

    expect(initUser).toBeTruthy();
  });

  it('Test Init User token state', async () => {
    const initUserUsdcTx = await program.methods
      .initUserTokenState(mintUSDC)
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: 'confirmed' });

    const initUserSolTx = await program.methods
      .initUserTokenState(mintSOL)
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: 'confirmed' });

    expect(initUserUsdcTx).toBeTruthy();
    expect(initUserSolTx).toBeTruthy();
  });

  it('Test Init Bank', async () => {
    const initUSDCBankTx = await program.methods
      .initBank(
        new BN(5),
        new BN(5),
        new BN(50),
        new BN(7500),
        new BN(5),
        new BN(10),
        "USDC Bank",
        "USDC Bank Description",
        new BN(5),
        new BN(5),
        new BN(10000),
        new BN(86400),
      )
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: 'confirmed' });

    const initSOLBankTx = await program.methods
      .initBank(
        new BN(5),
        new BN(5),
        new BN(50),
        new BN(7500),
        new BN(3),
        new BN(15),
        "SOL Bank",
        "SOL Bank Description", 
        new BN(3),
        new BN(3),
        new BN(10000),
        new BN(86400),
      )
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: 'confirmed' });

    console.log('initUSDCBankTx', initUSDCBankTx);
    console.log('initSOLBankTx', initSOLBankTx);
    expect(initUSDCBankTx).toBeTruthy();
    expect(initSOLBankTx).toBeTruthy();
  });

  it('Test Init and Fund USDC Bank', async () => {
    const amount = 10_000 * 10 ** 6; // Changed to 6 decimals for USDC
    const mintTx = await mintTo(
      // @ts-ignore
      banksClient,
      signer,
      mintUSDC,
      usdcBankTokenAccount,
      signer,
      amount
    );

    expect(mintTx).toBeTruthy();
  });

  it('Test Init and Fund SOL Bank', async () => {
    
    // Deposit 1000 SOL (9 decimals)
    const depositAmount = 1000 * 10**9;
    
    const mintTx = await mintTo(
      // @ts-ignore
      banksClient,
      signer,
      mintSOL,
      solBankTokenAccount,
      signer,
      depositAmount
    );

    expect(mintTx).toBeTruthy();
  });

  it('Create and Fund Token Account', async () => {
    const USDCTokenAccount = await createAccount(
      // @ts-ignore
      banksClient,
      signer,
      mintUSDC,
      signer.publicKey
    );

    expect(USDCTokenAccount).toBeTruthy();

    const amount = 10_000 * 10 ** 6; // Changed to 6 decimals for USDC
    const mintUSDCTx = await mintTo(
      // @ts-ignore
      banksClient,
      signer,
      mintUSDC,
      USDCTokenAccount,
      signer,
      amount
    );

    expect(mintUSDCTx).toBeTruthy();
  });

  it('Create and Fund SOL Token Account', async () => {
    const SOLTokenAccount = await createAccount(
      // @ts-ignore
      banksClient,
      signer,
      mintSOL,
      signer.publicKey
    );
    expect(SOLTokenAccount).toBeTruthy();

    const amount = 10_000 * 10 ** 9;
    const mintSOLTx = await mintTo(
      // @ts-ignore
      banksClient,
      signer,
      mintSOL,
      SOLTokenAccount,
      signer,
      amount
    );

    expect(mintSOLTx).toBeTruthy();
  });

  it('Test Deposit', async () => {
    // For 200 USDC (6 decimals)
    const depositAmount = 1000 * 10**6;
    const depositUSDC = await program.methods
      .deposit(new BN(depositAmount))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: 'confirmed' });

      console.log('depositUSDC', depositUSDC);
    expect(depositUSDC).toBeTruthy();
  });

  it('Test SOL Deposit', async () => {
    // For 200 SOL (9 decimals)
    const depositAmount = 1000 * 10**9;
    const depositSOL = await program.methods
      .deposit(new BN(depositAmount))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: 'confirmed' });

      console.log('depositSOL', depositSOL);
    expect(depositSOL).toBeTruthy();
  });
  
  it('Test Borrow', async () => {
    // Reduce borrow amount to 10 SOL (10,000,000,000 lamports)
    const borrowAmount = 5 * 10**9;

    // derive PythNetworkFeedId account
    const [solPythNetworkFeedId] = PublicKey.findProgramAddressSync(
      [Buffer.from("SOL")],
      program.programId
    );
    const [usdcPythNetworkFeedId] = PublicKey.findProgramAddressSync(
      [Buffer.from("USDC")],
      program.programId
    );

    // Fix price feed validation
    const accounts = {
      signer: signer.publicKey,
      mintBorrow: mintSOL,
      mintCollateral: mintUSDC,

      priceUpdateBorrowToken: new PublicKey(solUsdPriceFeedAccount),
      priceUpdateCollateralToken: new PublicKey(usdcUsdPriceFeedAccount),

      pythNetworkFeedIdBorrowToken: solPythNetworkFeedId,
      pythNetworkFeedIdCollateralToken: usdcPythNetworkFeedId,

      tokenProgram: TOKEN_PROGRAM_ID,
    };

    // Add required accounts
    const borrowSOL = await program.methods
      .borrow(new BN(borrowAmount))
      .accounts(accounts)
      .rpc({ commitment: 'confirmed', skipPreflight: true });
    expect(borrowSOL).toBeTruthy();
  });

  it('Test Repay', async () => {
    // derive PythNetworkFeedId account
    const [solPythNetworkFeedId] = PublicKey.findProgramAddressSync(
      [Buffer.from("SOL")],
      program.programId
    );
    const [usdcPythNetworkFeedId] = PublicKey.findProgramAddressSync(
      [Buffer.from("USDC")],
      program.programId
    );

    const accounts = {
      signer: signer.publicKey,
      mintBorrow: mintSOL,
      mintCollateral: mintUSDC,

      priceUpdateBorrowToken: new PublicKey(pythSolanaReceiver
        .getPriceFeedAccountAddress(0, SOL_PRICE_FEED_ID).toBase58()),
      pythNetworkFeedIdBorrowToken: solPythNetworkFeedId,

      priceUpdateCollateralToken: new PublicKey(pythSolanaReceiver
        .getPriceFeedAccountAddress(0, USDC_PRICE_FEED_ID).toBase58()),
      pythNetworkFeedIdCollateralToken: usdcPythNetworkFeedId,

      tokenProgram: TOKEN_PROGRAM_ID,
    };


    const repayAmount = 5 * 10**9;
    const repaySOL = await program.methods
      .repay(new BN(repayAmount))
      .accounts(accounts)
      .rpc({ commitment: 'confirmed', skipPreflight: true });
    expect(repaySOL).toBeTruthy();
  });

  it('Test Withdraw', async () => {
    // derive PythNetworkFeedId account
    const [solPythNetworkFeedId] = PublicKey.findProgramAddressSync(
      [Buffer.from("SOL")],
      program.programId
    );
    const [usdcPythNetworkFeedId] = PublicKey.findProgramAddressSync(
      [Buffer.from("USDC")],
      program.programId
    );

    const accounts = {
      signer: signer.publicKey,
      mint: mintUSDC,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    const withdrawAmount = 1000 * 10**6;
    const withdrawSOL = await program.methods
      .withdraw(new BN(withdrawAmount))
      .accounts(accounts)
      .rpc({ commitment: 'confirmed', skipPreflight: true });
    expect(withdrawSOL).toBeTruthy();
  });

  it("Test Get User Financial Profile", async () => {
    console.log("Starting Test Get User Financial Profile");
    // Derive the user's global state PDA using the seed [b"user_global", userPublicKey].
    console.log("Deriving user global state PDA for signer:", signer.publicKey.toBase58());
    const [userGlobalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_global"), signer.publicKey.toBuffer()],
      program.programId
    );
    console.log("User global state PDA derived:", userGlobalStatePDA.toBase58());
    
    console.log("Fetching user global state data...");
    const userGlobalState = await program.account.userGlobalState.fetch(userGlobalStatePDA);
    console.log("User Global State:", userGlobalState);
    console.log("User Global State - depositedMints:", userGlobalState.depositedMints);
    console.log("User Global State - activePositions:", userGlobalState.activePositions);
    console.log("User Global State - bump:", userGlobalState.bump);
  
    // For each deposited mint (i.e. for each bank the user has interacted with),
    // derive and fetch the user token state (which stores deposited, collateral, and borrow shares).
    console.log(`Processing ${userGlobalState.depositedMints.length} deposited mints`);
    for (const mint of userGlobalState.depositedMints) {
      console.log("Processing mint:", mint.toBase58());
      console.log("Deriving user token state PDA for this mint...");
      const [userTokenStatePDA] = PublicKey.findProgramAddressSync(
        [signer.publicKey.toBuffer(), mint.toBuffer()],
        program.programId
      );
      console.log("User token state PDA:", userTokenStatePDA.toBase58());
      
      console.log("Fetching user token state data...");
      const userTokenState = await program.account.userTokenState.fetch(userTokenStatePDA);
      console.log(`User Token State for mint ${mint.toBase58()}:`, userTokenState);
      console.log("  - Owner:", userTokenState.owner.toBase58());
      console.log("  - Mint Address:", userTokenState.mintAddress.toBase58());
      console.log("  - Deposited Shares:", userTokenState.depositedShares.toString());
      console.log("  - Collateral Shares:", userTokenState.collateralShares.toString());
      console.log("  - Borrowed Shares:", userTokenState.borrowedShares.toString());
      console.log("  - Last Updated Deposited:", userTokenState.lastUpdatedDeposited.toString());
      console.log("  - Last Updated Collateral:", userTokenState.lastUpdatedCollateral.toString());
      console.log("  - Last Updated Borrowed:", userTokenState.lastUpdatedBorrowed.toString());
    }
  
    // For each active borrow position (if any), fetch the BorrowPosition account.
    console.log(`Processing ${userGlobalState.activePositions.length} active borrow positions`);
    for (const pos of userGlobalState.activePositions) {
      console.log("Processing borrow position:", pos.toBase58());
      console.log("Fetching borrow position data...");
      const borrowPosition = await program.account.borrowPosition.fetch(pos);
      console.log(`Borrow Position ${pos.toBase58()}:`, borrowPosition);
      console.log("  - Owner:", borrowPosition.owner.toBase58());
      console.log("  - Collateral Mint:", borrowPosition.collateralMint.toBase58());
      console.log("  - Borrow Mint:", borrowPosition.borrowMint.toBase58());
      console.log("  - Collateral Shares:", borrowPosition.collateralShares.toString());
      console.log("  - Borrowed Shares:", borrowPosition.borrowedShares.toString());
      console.log("  - Last Updated:", borrowPosition.lastUpdated.toString());
      console.log("  - Active:", borrowPosition.active);
    }
    console.log("Test Get User Financial Profile completed");
  });
  
  it("Test Get User Deposits", async () => {
    console.log("Starting Test Get User Deposits");
    // This test uses the user's public key to list deposits across all banks.
    console.log("Deriving user global state PDA for signer:", signer.publicKey.toBase58());
    const [userGlobalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_global"), signer.publicKey.toBuffer()],
      program.programId
    );
    console.log("User global state PDA derived:", userGlobalStatePDA.toBase58());
    
    console.log("Fetching user global state data...");
    const userGlobalState = await program.account.userGlobalState.fetch(userGlobalStatePDA);
    console.log("User Global State:", userGlobalState);
    console.log("User has deposited in", userGlobalState.depositedMints.length, "mints");
    
    const depositsInfo = [];
    console.log("Processing each deposited mint to get detailed information...");
    for (const mint of userGlobalState.depositedMints) {
      console.log("Processing mint:", mint.toBase58());
      console.log("Deriving user token state PDA for this mint...");
      const [userTokenStatePDA] = PublicKey.findProgramAddressSync(
        [signer.publicKey.toBuffer(), mint.toBuffer()],
        program.programId
      );
      console.log("User token state PDA:", userTokenStatePDA.toBase58());
      
      console.log("Fetching user token state data...");
      const userTokenState = await program.account.userTokenState.fetch(userTokenStatePDA);
      console.log("User token state fetched:", userTokenState);
      
      const depositInfo = {
        mint: mint.toBase58(),
        depositedShares: userTokenState.depositedShares,
        collateralShares: userTokenState.collateralShares,
        borrowedShares: userTokenState.borrowedShares,
        lastUpdatedDeposited: userTokenState.lastUpdatedDeposited,
        lastUpdatedCollateral: userTokenState.lastUpdatedCollateral,
        lastUpdatedBorrowed: userTokenState.lastUpdatedBorrowed,
      };
      console.log("Created deposit info object:", depositInfo);
      depositsInfo.push(depositInfo);
    }
    console.log("All User Deposits Information:", depositsInfo);
    console.log("Total number of deposits:", depositsInfo.length);
    expect(depositsInfo.length).toBeGreaterThan(0);
    console.log("Test Get User Deposits completed successfully");
  });
  
  it("Test Get Active Borrow Positions", async () => {
    console.log("Starting Test Get Active Borrow Positions");
    // Derive the user's global state PDA.
    console.log("Deriving user global state PDA for signer:", signer.publicKey.toBase58());
    const [userGlobalStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_global"), signer.publicKey.toBuffer()],
      program.programId
    );
    console.log("User global state PDA derived:", userGlobalStatePDA.toBase58());
    
    console.log("Fetching user global state data...");
    const userGlobalState = await program.account.userGlobalState.fetch(userGlobalStatePDA);
    console.log("User Global State:", userGlobalState);
    console.log("User has", userGlobalState.activePositions.length, "active borrow positions");
    
    const borrowPositions = [];
    console.log("Processing each active position to get detailed information...");
    for (const posPubkey of userGlobalState.activePositions) {
      console.log("Processing position:", posPubkey.toBase58());
      console.log("Fetching borrow position data...");
      const borrowPosition = await program.account.borrowPosition.fetch(posPubkey);
      console.log("Borrow position fetched:", borrowPosition);
      
      const positionInfo = {
        position: posPubkey.toBase58(),
        owner: borrowPosition.owner.toBase58(),
        collateralMint: borrowPosition.collateralMint.toBase58(),
        borrowMint: borrowPosition.borrowMint.toBase58(),
        collateralShares: borrowPosition.collateralShares,
        borrowedShares: borrowPosition.borrowedShares,
        lastUpdated: borrowPosition.lastUpdated,
        active: borrowPosition.active,
      };
      console.log("Created position info object:", positionInfo);
      borrowPositions.push(positionInfo);
    }
    console.log("All User Active Borrow Positions:", borrowPositions);
    console.log("Total number of active positions:", borrowPositions.length);
    console.log("Note: It's valid for a user to have zero borrow positions.");
    console.log("Test Get Active Borrow Positions completed");
  });
  
});
