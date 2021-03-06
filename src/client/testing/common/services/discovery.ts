// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { traceError } from '../../../common/logger';
import { ExecutionFactoryCreateWithEnvironmentOptions, ExecutionResult, IPythonExecutionFactory, SpawnOptions } from '../../../common/process/types';
import { EXTENSION_ROOT_DIR } from '../../../constants';
import { captureTelemetry } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { ITestDiscoveryService, TestDiscoveryOptions, Tests } from '../types';
import { DiscoveredTests, ITestDiscoveredTestParser } from './types';

const DISCOVERY_FILE = path.join(EXTENSION_ROOT_DIR, 'pythonFiles', 'testing_tools', 'run_adapter.py');

@injectable()
export class TestsDiscoveryService implements ITestDiscoveryService {
    constructor(@inject(IPythonExecutionFactory) private readonly execFactory: IPythonExecutionFactory,
        @inject(ITestDiscoveredTestParser) private readonly parser: ITestDiscoveredTestParser) { }
    @captureTelemetry(EventName.UNITTEST_DISCOVER_WITH_PYCODE, undefined, true)
    public async discoverTests(options: TestDiscoveryOptions): Promise<Tests> {
        let output: ExecutionResult<string> | undefined;
        try {
            output = await this.exec(options);
            const discoveredTests = JSON.parse(output.stdout) as DiscoveredTests[];
            return this.parser.parse(options.workspaceFolder, discoveredTests);
        } catch (ex) {
            if (output) {
                traceError('Failed to parse discovered Test', new Error(output.stdout));
            }
            traceError('Failed to parse discovered Test', ex);
            throw ex;
        }
    }
    public async exec(options: TestDiscoveryOptions): Promise<ExecutionResult<string>> {
        const creationOptions: ExecutionFactoryCreateWithEnvironmentOptions = {
            allowEnvironmentFetchExceptions: false,
            resource: options.workspaceFolder
        };
        const execService = await this.execFactory.createActivatedEnvironment(creationOptions);
        const spawnOptions: SpawnOptions = {
            token: options.token,
            cwd: options.cwd,
            throwOnStdErr: true
        };
        return execService.exec([DISCOVERY_FILE, ...options.args], spawnOptions);
    }
}
