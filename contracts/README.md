# Countersign contracts

Bounded Safe payment execution, a restricted CCTP V2 source route, and full-capacity reserved payment protection.

```sh
forge test
forge fmt --check src test
forge build --sizes
```

See [the contract security and recovery guide](../docs/contracts.md) for the exact signing schema, authority diagram, fee semantics, deployment gates, reserve lifecycle and limitations. No deployment or real-money transfer is performed by the test suite. Generated integration ABIs live in `abi/`.
