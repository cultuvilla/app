- Fix: on a phone outside Spain's peninsular timezone (Canarias, or abroad),
  the Inicio feed dropped today's events early — it cut off at the phone's
  midnight instead of Madrid's. The hourly event-completion sweep now reads
  only the events whose day is over instead of every published event.
  **Migration:** none.
