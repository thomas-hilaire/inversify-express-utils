// test libraries
import { expect } from "chai";

// dependencies
import * as express from "express";
import { InversifyExpressRouter } from "../src/router";
import { Container } from "inversify";

describe("Unit Test: InversifyExpressRouter", () => {

    it("Should allow to pass a custom Router instance", () => {

        let container = new Container();

        let customRouter = express.Router({
            caseSensitive: false,
            mergeParams: false,
            strict: false
        });

        let inversifyRouter = new InversifyExpressRouter(container, customRouter);

        expect((inversifyRouter as any)._router === customRouter).to.be.true;
    });

});
