- On dev and beta, app actions that call the server (sign in, sign up for an
  event, join a group, …) go through one service next to the database in
  Madrid, so they wait less for a cold start and for the trip to the US.
  Production is unchanged. **Migration:** none.
