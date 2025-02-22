use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::state::*;

#[derive(Accounts)]
pub struct InitBank<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
 
    #[account(
        init,
        space = 8 + Bank::INIT_SPACE,
        payer = signer,
        seeds = [mint.key().as_ref()],
        bump
    )]
    pub bank: Account<'info, Bank>,

    #[account(
        init,
        token::mint = mint,
        token::authority = bank_token_account,
        payer = signer,
        seeds = [b"treasury", mint.key().as_ref()],
        bump,
    )]
    pub bank_token_account: InterfaceAccount<'info,TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn process_init_bank(ctx: Context<InitBank>, liquidation_threshold: u64, max_ltv: u64) -> Result<()> {
    let bank = &mut ctx.accounts.bank;
    bank.authority = ctx.accounts.signer.key();
    bank.mint_address = ctx.accounts.mint.key();
    bank.liquidation_threshold = liquidation_threshold;
    bank.max_ltv = max_ltv;
    bank.last_updated = Clock::get()?.unix_timestamp;
    
    
    Ok(())
}