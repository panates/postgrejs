# Developer Documentation

## Tests

### Run the test suite

1. You must spin up a postgres database on your local machine that allows for trusted (i.e. passwordless) authentication. The database should be running on localhost at port `5432` (the standard postgres port). 

    You may choose to (but not are not required to) use docker for this purpose by running the below.

    ```bash
    docker compose up
    # or this to run in the background
    docker compose up --detach
    ```

2. Execute the test suite with: `npm test`
