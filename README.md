# Rock Paper Scissors

## How To Play

### Bet Amount
Each player makes bets based on their balances(wallets) in this contract. So players must make deposits to their wallets and make sure there are sufficient funds to make their bets.

### Procedure
In order for players to not be able to see their opponent's move until both players have played, as well as to prohibit players from changing their moves, execution of this game is split into the 'enrol' and 'play' stages.

Step 1: Players obtain a hash from the contract using their intended move as well as a personal code. 

Step 2 (Enrol): Players enrol by sending their hash, as well as their bet amount. At this point, their move is locked in. Once both players have enrolled, the game may proceed to the 'play' stage.

Step 3 (Play): Players play by 'unlocking' the move they had submitted earlier. This is done via invoking the play function using their personal code and the move they had earlier submitted.

### Rules
The first player to enrol gets to choose the bet amount. The second player must bet the exact amount in order to enrol.
In a tie, both players get their bet amounts back. Otherwise, the winner gets their bet amount back as well as the loser's bet amount (ie. bet amount x 2).

### Cancellations
If a player enrols and there is no opponent enrolling within the enrollment deadline, the player may choose to cancel their enrollment and have their bet amount returned to their contract balance.

If both players have enrolled, but only 1 has played(unlocked) by the deadline, it will be counted as a loss for the other player.

If both players have enrolled but none have played(unlocked) by the deadline, the owner may cancel the game and both bet amounts will go to the owner.

### Earnings and Losses
Earnings and losses are credited to and debited from each player's balance in this contract. As long as the contract is live and not paused, players may make withdrawals.


