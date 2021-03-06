// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { expect } from 'chai';
import { EOL } from 'os';
import * as path from 'path';
import { SemVer } from 'semver';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import * as typemoq from 'typemoq';
import { Uri, workspace as workspaceType, WorkspaceConfiguration } from 'vscode';

import { PlatformService } from '../../../client/common/platform/platformService';
import { IPlatformService } from '../../../client/common/platform/types';
import { CurrentProcess } from '../../../client/common/process/currentProcess';
import { ProcessService } from '../../../client/common/process/proc';
import { ProcessServiceFactory } from '../../../client/common/process/processFactory';
import { IProcessService, IProcessServiceFactory } from '../../../client/common/process/types';
import { TerminalHelper } from '../../../client/common/terminal/helper';
import { ITerminalHelper } from '../../../client/common/terminal/types';
import { ICurrentProcess } from '../../../client/common/types';
import { clearCache } from '../../../client/common/utils/cacheUtils';
import { getNamesAndValues } from '../../../client/common/utils/enum';
import { Architecture, OSType } from '../../../client/common/utils/platform';
import { EnvironmentVariablesProvider } from '../../../client/common/variables/environmentVariablesProvider';
import { IEnvironmentVariablesProvider } from '../../../client/common/variables/types';
import { EXTENSION_ROOT_DIR } from '../../../client/constants';
import { EnvironmentActivationService } from '../../../client/interpreter/activation/service';
import { InterpreterType, PythonInterpreter } from '../../../client/interpreter/contracts';
import { noop } from '../../core';
import { mockedVSCodeNamespaces } from '../../vscode-mock';

const getEnvironmentPrefix = 'e8b39361-0157-4923-80e1-22d70d46dee6';
const defaultShells = {
    [OSType.Windows]: 'cmd',
    [OSType.OSX]: 'bash',
    [OSType.Linux]: 'bash',
    [OSType.Unknown]: undefined
};

// tslint:disable:no-unnecessary-override no-any max-func-body-length
suite('Interprters Activation - Python Environment Variables', () => {
    let service: EnvironmentActivationService;
    let helper: ITerminalHelper;
    let platform: IPlatformService;
    let processServiceFactory: IProcessServiceFactory;
    let processService: IProcessService;
    let currentProcess: ICurrentProcess;
    let envVarsService: IEnvironmentVariablesProvider;
    let workspace: typemoq.IMock<typeof workspaceType>;

    const pythonInterpreter: PythonInterpreter = {
        path: '/foo/bar/python.exe',
        version: new SemVer('3.6.6-final'),
        sysVersion: '1.0.0.0',
        sysPrefix: 'Python',
        type: InterpreterType.Unknown,
        architecture: Architecture.x64
    };

    function initSetup() {
        helper = mock(TerminalHelper);
        platform = mock(PlatformService);
        processServiceFactory = mock(ProcessServiceFactory);
        processService = mock(ProcessService);
        currentProcess = mock(CurrentProcess);
        envVarsService = mock(EnvironmentVariablesProvider);
        workspace = mockedVSCodeNamespaces.workspace!;
        when(envVarsService.onDidEnvironmentVariablesChange).thenReturn(noop as any);
        service = new EnvironmentActivationService(
            instance(helper), instance(platform),
            instance(processServiceFactory), instance(currentProcess),
            instance(envVarsService)
        );

        const cfg = typemoq.Mock.ofType<WorkspaceConfiguration>();
        workspace.setup(w => w.getConfiguration(typemoq.It.isValue('python'), typemoq.It.isAny()))
            .returns(() => cfg.object);
        workspace.setup(w => w.workspaceFolders).returns(() => []);
        cfg.setup(c => c.inspect(typemoq.It.isValue('pythonPath')))
            .returns(() => { return { globalValue: 'GlobalValuepython' } as any; });
        clearCache();

        verify(envVarsService.onDidEnvironmentVariablesChange).once();
    }
    teardown(() => {
        mockedVSCodeNamespaces.workspace!.reset();
    });

    function title(resource?: Uri, interpreter?: PythonInterpreter) {
        return `${resource ? 'With a resource' : 'Without a resource'}${interpreter ? ' and an interpreter' : ''}`;
    }

    [undefined, Uri.parse('a')].forEach(resource =>
        [undefined, pythonInterpreter].forEach(interpreter =>  {
        suite(title(resource, interpreter), () => {
            setup(initSetup);
            test('Unknown os will return empty variables', async () => {
                when(platform.osType).thenReturn(OSType.Unknown);
                const env = await service.getActivatedEnvironmentVariables(resource);

                verify(platform.osType).once();
                expect(env).to.equal(undefined, 'Should not have any variables');
            });

            const osTypes = getNamesAndValues<OSType>(OSType)
                .filter(osType => osType.value !== OSType.Unknown);

            osTypes.forEach(osType => {
                suite(osType.name, () => {
                    setup(initSetup);
                    test('getEnvironmentActivationShellCommands will be invoked', async () => {
                        when(platform.osType).thenReturn(osType.value);
                        when(helper.getEnvironmentActivationShellCommands(resource, interpreter)).thenResolve();

                        const env = await service.getActivatedEnvironmentVariables(resource, interpreter);

                        verify(platform.osType).once();
                        expect(env).to.equal(undefined, 'Should not have any variables');
                        verify(helper.getEnvironmentActivationShellCommands(resource, interpreter)).once();
                    });
                    test('Validate command used to activation and printing env vars', async () => {
                        const cmd = ['1', '2'];
                        const envVars = { one: '1', two: '2' };
                        when(platform.osType).thenReturn(osType.value);
                        when(helper.getEnvironmentActivationShellCommands(resource, interpreter)).thenResolve(cmd);
                        when(processServiceFactory.create(resource)).thenResolve(instance(processService));
                        when(envVarsService.getEnvironmentVariables(resource)).thenResolve(envVars);

                        const env = await service.getActivatedEnvironmentVariables(resource, interpreter);

                        verify(platform.osType).once();
                        expect(env).to.equal(undefined, 'Should not have any variables');
                        verify(helper.getEnvironmentActivationShellCommands(resource, interpreter)).once();
                        verify(processServiceFactory.create(resource)).once();
                        verify(envVarsService.getEnvironmentVariables(resource)).once();
                        verify(processService.shellExec(anything(), anything())).once();

                        const shellCmd = capture(processService.shellExec).first()[0];

                        const printEnvPyFile = path.join(EXTENSION_ROOT_DIR, 'pythonFiles', 'printEnvVariables.py');
                        const expectedCommand = `${cmd.join(' && ')} && echo '${getEnvironmentPrefix}' && python ${printEnvPyFile.fileToCommandArgument()}`;

                        expect(shellCmd).to.equal(expectedCommand);
                    });
                    test('Validate env Vars used to activation and printing env vars', async () => {
                        const cmd = ['1', '2'];
                        const envVars = { one: '1', two: '2' };
                        when(platform.osType).thenReturn(osType.value);
                        when(helper.getEnvironmentActivationShellCommands(resource, interpreter)).thenResolve(cmd);
                        when(processServiceFactory.create(resource)).thenResolve(instance(processService));
                        when(envVarsService.getEnvironmentVariables(resource)).thenResolve(envVars);

                        const env = await service.getActivatedEnvironmentVariables(resource, interpreter);

                        verify(platform.osType).once();
                        expect(env).to.equal(undefined, 'Should not have any variables');
                        verify(helper.getEnvironmentActivationShellCommands(resource, interpreter)).once();
                        verify(processServiceFactory.create(resource)).once();
                        verify(envVarsService.getEnvironmentVariables(resource)).once();
                        verify(processService.shellExec(anything(), anything())).once();

                        const options = capture(processService.shellExec).first()[1];

                        const expectedShell = defaultShells[osType.value];
                        expect(options).to.deep.equal({ shell: expectedShell, env: envVars, timeout: 30000, maxBuffer: 1000 * 1000 });
                    });
                    test('Use current process variables if there are no custom variables', async () => {
                        const cmd = ['1', '2'];
                        const envVars = { one: '1', two: '2' };
                        when(platform.osType).thenReturn(osType.value);
                        when(helper.getEnvironmentActivationShellCommands(resource, interpreter)).thenResolve(cmd);
                        when(processServiceFactory.create(resource)).thenResolve(instance(processService));
                        when(envVarsService.getEnvironmentVariables(resource)).thenResolve({});
                        when(currentProcess.env).thenReturn(envVars);

                        const env = await service.getActivatedEnvironmentVariables(resource, interpreter);

                        verify(platform.osType).once();
                        expect(env).to.equal(undefined, 'Should not have any variables');
                        verify(helper.getEnvironmentActivationShellCommands(resource, interpreter)).once();
                        verify(processServiceFactory.create(resource)).once();
                        verify(envVarsService.getEnvironmentVariables(resource)).once();
                        verify(processService.shellExec(anything(), anything())).once();
                        verify(currentProcess.env).once();

                        const options = capture(processService.shellExec).first()[1];

                        const expectedShell = defaultShells[osType.value];
                        expect(options).to.deep.equal({ shell: expectedShell, env: envVars, timeout: 30000, maxBuffer: 1000 * 1000 });
                    });
                    test('Error must be swallowed when activation fails', async () => {
                        const cmd = ['1', '2'];
                        const envVars = { one: '1', two: '2' };
                        when(platform.osType).thenReturn(osType.value);
                        when(helper.getEnvironmentActivationShellCommands(resource, interpreter)).thenResolve(cmd);
                        when(processServiceFactory.create(resource)).thenResolve(instance(processService));
                        when(envVarsService.getEnvironmentVariables(resource)).thenResolve(envVars);
                        when(processService.shellExec(anything(), anything())).thenReject(new Error('kaboom'));

                        const env = await service.getActivatedEnvironmentVariables(resource, interpreter);

                        verify(platform.osType).once();
                        expect(env).to.equal(undefined, 'Should not have any variables');
                        verify(helper.getEnvironmentActivationShellCommands(resource, interpreter)).once();
                        verify(processServiceFactory.create(resource)).once();
                        verify(envVarsService.getEnvironmentVariables(resource)).once();
                        verify(processService.shellExec(anything(), anything())).once();
                    });
                    test('Return parsed variables', async () => {
                        const cmd = ['1', '2'];
                        const envVars = { one: '1', two: '2' };
                        const varsFromEnv = { one: '11', two: '22', HELLO: 'xxx' };
                        const stdout = `${getEnvironmentPrefix}${EOL}${JSON.stringify(varsFromEnv)}`;
                        when(platform.osType).thenReturn(osType.value);
                        when(helper.getEnvironmentActivationShellCommands(resource, interpreter)).thenResolve(cmd);
                        when(processServiceFactory.create(resource)).thenResolve(instance(processService));
                        when(envVarsService.getEnvironmentVariables(resource)).thenResolve(envVars);
                        when(processService.shellExec(anything(), anything())).thenResolve({ stdout: stdout });

                        const env = await service.getActivatedEnvironmentVariables(resource, interpreter);

                        verify(platform.osType).once();
                        expect(env).to.deep.equal(varsFromEnv);
                        verify(helper.getEnvironmentActivationShellCommands(resource, interpreter)).once();
                        verify(processServiceFactory.create(resource)).once();
                        verify(envVarsService.getEnvironmentVariables(resource)).once();
                        verify(processService.shellExec(anything(), anything())).once();
                    });
                });
            });
        });
    }));
});
