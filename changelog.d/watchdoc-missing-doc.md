- Fix: the profile's Grupos and Peñas lists showed nothing on device. A live
  read of a document that does not exist (your membership in an org you never
  joined) ran the strict converter on empty data and failed, which emptied the
  whole list. **Migration:** none.
