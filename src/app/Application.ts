import { extensions, ExtensionType } from '../extensions/Extensions';
import { autoDetectRenderer } from '../rendering/renderers/autoDetectRenderer';
import { Container } from '../scene/container/Container';

import type { Rectangle } from '../maths/shapes/Rectangle';
import type { AutoDetectOptions } from '../rendering/renderers/autoDetectRenderer';
import type { Renderer } from '../rendering/renderers/types';
import type { DestroyOptions } from '../scene/container/destroyTypes';
import type { ICanvas } from '../settings/adapter/ICanvas';
import type { ResizePluginOptions } from './ResizePlugin';

/** Any plugin that's usable for Application should contain these methods. */
export interface ApplicationPlugin
{
    /**
     * Called when Application is constructed, scoped to Application instance.
     * Passes in `options` as the only argument, which are Application constructor options.
     * @param {object} options - Application options.
     */
    init(options: Partial<ApplicationOptions>): void;
    /** Called when destroying Application, scoped to Application instance. */
    destroy(): void;
}

/** Application options supplied to constructor. */
export interface ApplicationOptions extends AutoDetectOptions, PixiMixins.ApplicationOptions, ResizePluginOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Application extends PixiMixins.Application {}

/**
 * Convenience class to create a new PixiJS application.
 *
 * This class automatically creates the renderer, ticker and root container.
 * @example
 * import { Application, Sprite } from 'pixi.js';
 *
 * // Create the application
 * const app = new Application();
 *
 * await app.init();
 *
 * // Add the view to the DOM
 * document.body.appendChild(app.view);
 *
 * // ex, add display objects
 * app.stage.addChild(Sprite.from('something.png'));
 * @class
 */
export class Application<VIEW extends ICanvas = ICanvas>
{
    /** Collection of installed plugins. */
    public static _plugins: ApplicationPlugin[] = [];

    /**
     * The root display container that's rendered.
     * @member {Container}
     */
    public stage: Container = new Container();

    /**
     * WebGL renderer if available, otherwise CanvasRenderer.
     * @member {Renderer}
     */
    public renderer: Renderer;

    /**
     * @param options - The optional application and renderer parameters.
     */
    public async init(options?: Partial<ApplicationOptions>)
    {
        // The default options
        options = {
            ...{
                // forceCanvas: false,
            },
            ...options,
        };

        this.renderer = await autoDetectRenderer(options as ApplicationOptions);

        // install plugins here
        Application._plugins.forEach((plugin) =>
        {
            plugin.init.call(this, options);
        });
    }

    /** Render the current stage. */
    public render(): void
    {
        this.renderer.render({ container: this.stage });
    }

    /**
     * Reference to the renderer's canvas element.
     * @member {ICanvas}
     * @readonly
     */
    get canvas(): VIEW
    {
        return this.renderer.element as VIEW;
    }

    /**
     * Reference to the renderer's screen rectangle. Its safe to use as `filterArea` or `hitArea` for the whole screen.
     * @member {Rectangle}
     * @readonly
     */
    get screen(): Rectangle
    {
        return this.renderer.screen;
    }

    /**
     * Destroys the application and all of its resources.
     * @param {object|boolean} [options=false] - The options for destroying the application.
     * @param {boolean} [options.removeView=false] - Whether to remove the application's canvas element from the DOM.
     * @param {boolean} [options.children=false] - If set to true, all the children will have their destroy method
     * called as well. `options` will be passed on to those calls.
     * @param {boolean} [options.texture=false] - Only used for children with textures e.g. Sprites.
     * If options.children is set to true,
     * it should destroy the texture of the child sprite.
     * @param {boolean} [options.textureSource=false] - Only used for children with textures e.g. Sprites.
     *  If options.children is set to true,
     * it should destroy the texture source of the child sprite.
     * @param {boolean} [options.context=false] - Only used for children with graphicsContexts e.g. Graphics.
     * If options.children is set to true,
     * it should destroy the context of the child graphics.
     */
    public destroy(options: DestroyOptions = false): void
    {
        // Destroy plugins in the opposite order
        // which they were constructed
        const plugins = Application._plugins.slice(0);

        plugins.reverse();
        plugins.forEach((plugin) =>
        {
            plugin.destroy.call(this);
        });

        this.stage.destroy(options);
        this.stage = null;

        this.renderer.destroy(options);
        this.renderer = null;
    }
}

extensions.handleByList(ExtensionType.Application, Application._plugins);