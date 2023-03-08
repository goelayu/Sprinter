package main

import (
	"os"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/require"
)

func main() {
	vm := goja.New()
	filepath := "/run/user/99542426/goelayu/panode/program_analysis/instrument.js"
	// read the file
	file, err := os.ReadFile(filepath)
	if err != nil {
		panic(err)
	}

	require := new(require.Registry)
	require.Enable(vm)

	_, err = vm.RunString(string(file))
	if err != nil {
		panic(err)
	}
	// sum, ok := goja.AssertFunction(vm.Get("sum"))
	// if !ok {
	// 	panic("Not a function")
	// }

	// res, err := sum(goja.Undefined(), vm.ToValue(40), vm.ToValue(2))
	// if err != nil {
	// 	panic(err)
	// }
	// fmt.Println(res)
}
