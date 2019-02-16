# Impulse JWT Token verification

Impulse holds a list of JWT tokens in DB, any requests coming should have one of these tokens for their request to be processed by Impulse. Otherwise it means someone outside of the network is trying to connect to impulse.

Impulse node is hosted by the network creator. So when creating network, we add add a token for the first dynamo node in the DB for Impulse. 

For new nodes added to the network, first then write the token to blockchain and send a register request to Impulse, impulse reads this from blockchain and then adds it to it's DB.
