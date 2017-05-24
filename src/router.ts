import * as express from "express";
import * as inversify from "inversify";
import { interfaces } from "./interfaces";
import { TYPE, METADATA_KEY, DEFAULT_ROUTING_ROOT_PATH, PARAMETER_TYPE } from "./constants";

/**
 * Wrapper for the express router.
 */
export class InversifyExpressRouter  {

    private _router: express.Router;
    private _container: inversify.interfaces.Container;

    /**
     * Wrapper for the express router.
     *
     * @param container Container loaded with all controllers and their dependencies.
     */
    constructor(
        container: inversify.interfaces.Container,
        router: express.Router,
    ) {
        this._container = container;
        this._router = router;
    }

    /**
     * Applies all routes, returning the express router.
     */
    public build(): express.Router {
        this.registerControllers();
        return this._router;
    }

    private registerControllers() {

        let controllers: interfaces.Controller[] = this._container.getAll<interfaces.Controller>(TYPE.Controller);

        controllers.forEach((controller: interfaces.Controller) => {

            let controllerMetadata: interfaces.ControllerMetadata = Reflect.getOwnMetadata(
                METADATA_KEY.controller,
                controller.constructor
            );

            let methodMetadata: interfaces.ControllerMethodMetadata[] = Reflect.getOwnMetadata(
                METADATA_KEY.controllerMethod,
                controller.constructor
            );

            let parameterMetadata: interfaces.ControllerParameterMetadata = Reflect.getOwnMetadata(
                METADATA_KEY.controllerParameter,
                controller.constructor
            );

            if (controllerMetadata && methodMetadata) {
                let router: express.Router = express.Router();
                let controllerMiddleware = this.resolveMidleware(...controllerMetadata.middleware);

                methodMetadata.forEach((metadata: interfaces.ControllerMethodMetadata) => {
                    let paramList: interfaces.ParameterMetadata[] = [];
                    if (parameterMetadata) {
                        paramList = parameterMetadata[metadata.key] || [];
                    }
                    let handler: express.RequestHandler = this.handlerFactory(controllerMetadata.target.name, metadata.key, paramList);
                    let routeMiddleware = this.resolveMidleware(...metadata.middleware);
                    this._router[metadata.method](
                        `${controllerMetadata.path}${metadata.path}`,
                        ...controllerMiddleware,
                        ...routeMiddleware,
                        handler
                    );
                });
            }
        });
    }

    private resolveMidleware(...middleware: interfaces.Middleware[]): express.RequestHandler[] {
        return middleware.map(middlewareItem => {
            try {
                return this._container.get<express.RequestHandler>(middlewareItem);
            } catch (_) {
                return middlewareItem as express.RequestHandler;
            }
        });
    }

    private handlerFactory(controllerName: any, key: string, parameterMetadata: interfaces.ParameterMetadata[]): express.RequestHandler {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
            let args = this.extractParameters(req, res, next, parameterMetadata);
            let result: any = this._container.getNamed(TYPE.Controller, controllerName)[key](...args);
            // try to resolve promise
            if (result && result instanceof Promise) {

                result.then((value: any) => {
                    if (value && !res.headersSent) {
                        res.send(value);
                    }
                })
                .catch((error: any) => {
                   next(error);
                });

            } else if (result && !res.headersSent) {
                res.send(result);
            }
        };
    }

    private extractParameters(req: express.Request, res: express.Response, next: express.NextFunction,
        params: interfaces.ParameterMetadata[]): any[] {
        let args = [];
        if (!params || !params.length) {
            return [req, res, next];
        }
        for (let item of params) {

            switch (item.type) {
                default: args[item.index] = res; break; // response
                case PARAMETER_TYPE.REQUEST: args[item.index] = this.getParam(req, null, item.parameterName); break;
                case PARAMETER_TYPE.NEXT: args[item.index] = next; break;
                case PARAMETER_TYPE.PARAMS: args[item.index] = this.getParam(req, "params", item.parameterName); break;
                case PARAMETER_TYPE.QUERY: args[item.index] = this.getParam(req, "query", item.parameterName); break;
                case PARAMETER_TYPE.BODY: args[item.index] = this.getParam(req, "body", item.parameterName); break;
                case PARAMETER_TYPE.HEADERS: args[item.index] = this.getParam(req, "headers", item.parameterName); break;
                case PARAMETER_TYPE.COOKIES: args[item.index] = this.getParam(req, "cookies", item.parameterName); break;
            }

        }
        args.push(req, res, next);
        return args;
    }

    private getParam(source: any, paramType: string, name: string) {
        let param = source[paramType] || source;
        return param[name] || this.checkQueryParam(paramType, param);
    }

    private checkQueryParam(paramType: string, param: any) {
        if (paramType === "query") {
            return undefined;
        } else {
            return param;
        }
    }
}
