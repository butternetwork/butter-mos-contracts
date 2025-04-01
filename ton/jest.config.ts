import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    transform: {},
    transformIgnorePatterns: [
        "/node_modules/(?!(@noble/secp256k1)/)"
    ],
};

export default config;
