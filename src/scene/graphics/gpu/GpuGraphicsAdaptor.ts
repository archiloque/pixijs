import { ExtensionType } from '../../../extensions/Extensions';
import { Matrix } from '../../../maths/matrix/Matrix';
import { getTextureBatchBindGroup } from '../../../rendering/batcher/gpu/getTextureBatchBindGroup';
import { MAX_TEXTURES } from '../../../rendering/batcher/shared/const';
import { compileHighShaderGpuProgram } from '../../../rendering/high-shader/compileHighShaderToProgram';
import { colorBit } from '../../../rendering/high-shader/shader-bits/colorBit';
import { generateTextureBatchBit } from '../../../rendering/high-shader/shader-bits/generateTextureBatchBit';
import { localUniformBit } from '../../../rendering/high-shader/shader-bits/localUniformBit';
import { BindGroup } from '../../../rendering/renderers/gpu/shader/BindGroup';
import { Shader } from '../../../rendering/renderers/shared/shader/Shader';
import { UniformGroup } from '../../../rendering/renderers/shared/shader/UniformGroup';
import { color32BitToUniform } from './colorToUniform';

import type { Batch } from '../../../rendering/batcher/shared/Batcher';
import type { GpuEncoderSystem } from '../../../rendering/renderers/gpu/GpuEncoderSystem';
import type { WebGPURenderer } from '../../../rendering/renderers/gpu/WebGPURenderer';
import type { Renderable } from '../../../rendering/renderers/shared/Renderable';
import type { GraphicsAdaptor, GraphicsPipe } from '../shared/GraphicsPipe';
import type { GraphicsView } from '../shared/GraphicsView';

export class GpuGraphicsAdaptor implements GraphicsAdaptor
{
    /** @ignore */
    public static extension = {
        type: [
            ExtensionType.WebGPUPipesAdaptor,
        ],
        name: 'graphics',
    } as const;

    private _shader: Shader;

    public init()
    {
        const localUniforms = new UniformGroup({
            color: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
            transformMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
        });

        const gpuProgram = compileHighShaderGpuProgram({
            name: 'graphics',
            bits: [
                colorBit,
                generateTextureBatchBit(MAX_TEXTURES),
                localUniformBit,
            ]
        });

        this._shader = new Shader({
            gpuProgram,
            groups: {
                // added on the fly!
                2: new BindGroup({ 0: localUniforms }),
            },
        });
    }

    public execute(graphicsPipe: GraphicsPipe, renderable: Renderable<GraphicsView>): void
    {
        const context = renderable.view.context;
        const shader = context.customShader || this._shader;
        const renderer = graphicsPipe.renderer as WebGPURenderer;
        const contextSystem = renderer.graphicsContext;

        // early out if there is no actual visual stuff...
        if (!contextSystem.getGpuContext(context).batches.length)
        { return; }

        const {
            geometry, instructions
        } = contextSystem.getContextRenderData(context);

        graphicsPipe.state.blendMode = renderable.layerBlendMode;

        const localUniforms = shader.resources.localUniforms;

        shader.resources.localUniforms.uniforms.uTransformMatrix = renderable.layerTransform;

        color32BitToUniform(
            renderable.layerColor,
            localUniforms.uniforms.uColor,
            0
        );

        // WebGPU specific...

        // TODO perf test this a bit...
        const encoder = renderer.encoder as GpuEncoderSystem;

        encoder.setPipelineFromGeometryProgramAndState(
            geometry,
            shader.gpuProgram,
            graphicsPipe.state
        );

        encoder.setGeometry(geometry);

        const globalUniformsBindGroup = renderer.globalUniforms.bindGroup;

        encoder.setBindGroup(0, globalUniformsBindGroup, shader.gpuProgram);

        const localBindGroup = (renderer as WebGPURenderer)
            .renderPipes.uniformBatch.getUniformBindGroup(localUniforms, true);

        encoder.setBindGroup(2, localBindGroup, shader.gpuProgram);

        const batches = instructions.instructions as Batch[];

        for (let i = 0; i < instructions.instructionSize; i++)
        {
            const batch = batches[i];

            shader.groups[1] = batch.bindGroup;

            if (!batch.gpuBindGroup)
            {
                const textureBatch = batch.textures;

                batch.bindGroup = getTextureBatchBindGroup(textureBatch.textures, textureBatch.count);
                batch.gpuBindGroup = renderer.bindGroup.getBindGroup(
                    batch.bindGroup, shader.gpuProgram, 1
                );
            }

            encoder.setBindGroup(1, batch.bindGroup, shader.gpuProgram);

            encoder.renderPassEncoder.drawIndexed(batch.size, 1, batch.start);
        }
    }

    public destroy(): void
    {
        this._shader.destroy(true);
        this._shader = null;
    }
}