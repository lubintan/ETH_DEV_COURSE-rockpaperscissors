# Rock Paper Scissors

## How To Play

### Bet Amount
Each player makes bets based on their balances(wallets) in this contract. So players must make deposits to their wallets and make sure there are sufficient funds to make their bets.

### Procedure
In order for players to not be able to see their opponent's move until both players have played, as well as to prohibit players from changing their moves, execution of this game is split into the 'enrol' and 'play' stages.

Step 1: Player 1 obtains a hash from the contract using their intended move as well as a personal code. 

Step 2 (Player 1 Enrol): Player 1 enrols by sending their hash, as well as their bet amount. At this point, their move is locked in. 

Step 3 (Player 2 Join): Player 2 joins the game. (Their address is registered.)

Step 3 (Play): Player 2 plays by sending in their move.

Step 4 (Unlock): Player 1 completes the process by 'unlocking' the move they had submitted earlier. This is done via invoking the unlock function using their personal code and the move they had earlier submitted.

### Rules
The first player to enrol gets to choose the bet amount. The second player must have at least the same amount in their balance to play.
In a tie, both players get their bet amounts back. Otherwise, the winner gets their bet amount back as well as the loser's bet amount (ie. bet amount x 2).

### Cancellations
If player 1 enrols and there is no opponent joining within the joining deadline, the player may choose to cancel the game and have their bet amount returned to their contract balance.

If player 1 has enrolled and player 2 has joined, but player 2 has not played within the playing deadline, player 1 may choose to cancel the game and have their bet amount returned to their contract balance.

If player 2 has played but player 1 has not unlocked their move by the unlock deadline, player 2 

### Earnings and Losses
Earnings and losses are credited to and debited from each player's balance in this contract. As long as the contract is live and not paused, players may make withdrawals.


