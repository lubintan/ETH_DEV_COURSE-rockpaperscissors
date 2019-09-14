# Rock Paper Scissors

## How To Play

### Bet Amount
Each player makes bets based on their balances(wallets) in this contract. So players must make deposits to their wallets and make sure there are sufficient funds to make their bets.

### Procedure
In order for players to not be able to see their opponent's move until both players have played, as well as to prohibit players from changing their moves, execution of this game is split into the 'enrol' and 'play' stages.

Step 1: Player 1 obtains a hash from the contract using their intended move as well as a personal code. 

Step 2 (Enrol): Player 1 enrols by sending their hash, as well as their bet amount. At this point, their move is locked in. 

Step 3 (Play): Player 2 plays with player 1 by sending in their move as well as a bet amount equal to player 1's bet.

Step 4 (Unlock): Player 1 completes the process by 'unlocking' the move they had submitted earlier. This is done via invoking the unlock function using their personal code and the move they had earlier submitted.

### Rules
The first player to enrol gets to choose the bet amount. The second player must bet the exact amount in order to play.
In a tie, both players get their bet amounts back. Otherwise, the winner gets their bet amount back as well as the loser's bet amount (ie. bet amount x 2).

### Cancellations
If a player enrols and there is no opponent playing within the enrollment deadline, the player may choose to cancel their enrollment and have their bet amount returned to their contract balance.

If player 2 has played but player 1 has not unlocked their move by the deadline, it will be counted as a loss for player 1.

### Earnings and Losses
Earnings and losses are credited to and debited from each player's balance in this contract. As long as the contract is live and not paused, players may make withdrawals.


