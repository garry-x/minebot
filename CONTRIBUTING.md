# Contributing to MineBot

Thank you for your interest in contributing to MineBot!

## Development Process

1. **Fork** the repository
2. **Clone** your fork: `git clone <your-fork-url>`
3. **Create** a feature branch: `git checkout -b feature/my-feature`
4. **Make** your changes
5. **Test** your changes: `npm test`
6. **Commit** your changes: `git commit -m 'Add some feature'`
7. **Push** to your fork: `git push origin feature/my-feature`
8. **Submit** a Pull Request

## Code Style

- Use consistent indentation (2 spaces)
- Add comments for complex logic
- Keep functions small and focused
- Follow existing patterns in the codebase

## Testing

Before submitting a PR, ensure all tests pass:

```bash
npm test
```

For watch mode during development:

```bash
npm run test:watch
```

## Reporting Issues

When reporting issues, please include:

1. **Version**: MineBot version (`node cli.js --version` or check package.json)
2. **Environment**: Node.js version, OS, Minecraft server version
3. **Steps to reproduce**: Clear steps to reproduce the issue
4. **Expected vs actual behavior**: What you expected vs what actually happened
5. **Logs**: Relevant log output (especially with `LOG_LEVEL=debug`)

## Feature Requests

For new features, please describe:

1. **Use case**: What problem does this feature solve?
2. **Proposed solution**: How do you envision it working?
3. **Alternatives**: Any other approaches you've considered?

## Documentation

- Update existing docs if your change affects APIs or behavior
- Add new documentation for new features
- Keep README.md in sync with code changes

## License

By contributing to MineBot, you agree that your contributions will be licensed under the MIT License.