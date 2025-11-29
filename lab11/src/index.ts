import { ExportWrapper, compileModule } from "../../lab09";
import { parseFunnier } from "../../lab10";
import { verifyModule } from "./verifier";

export async function parseVerifyAndCompile(moduleName: string,source: string): Promise<Record<string, Function>>
{
    const ast = parseFunnier(source);
    await verifyModule(ast);
    const mod = await compileModule(ast, moduleName);
    return new ExportWrapper(mod);
}
